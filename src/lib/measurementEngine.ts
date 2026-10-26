import {
  DEFAULT_CONFIG,
  LocationSample,
  MeasurementConfig,
  MeasurementResult,
  SpeedPoint,
} from "@/types/measurement";
import { interpolateTargetCrossing, mpsToKmh } from "@/utils/interpolation";

/**
 * Engine states. IDLE/ARMED are handled by the hook (GPS lifecycle);
 * the engine only cares about the measurement itself.
 */
export type EngineState = "WAIT_ZERO" | "RUNNING" | "DONE";

export type EngineEvent =
  | { type: "zero-confirmed" }
  | { type: "launch"; launchTime: number; sampleTime: number }
  | { type: "launch-refined"; launchTime: number; sampleTime: number }
  | { type: "target"; result: MeasurementResult }
  | { type: "signal-gap"; gapMs: number };

/**
 * Pure 0-100 km/h timing state machine.
 *
 * Timing rules (every millisecond counts):
 * - All times come from the GPS fix timestamp of each sample, never from
 *   when the callback happened to run.
 * - Launch and target crossing are both computed from the RAW Doppler speed.
 *   The filtered speed lags behind the real speed, so it is only used for
 *   the standstill detection and for display.
 * - The 100 km/h crossing is linearly interpolated between the two samples
 *   around it.
 * - The launch instant is first estimated at the first moving sample and then
 *   refined at the next one by extrapolating the measured acceleration back
 *   to the launch speed. With 1 Hz GPS the car may have started anywhere
 *   inside the previous second; the extrapolation recovers that instant
 *   exactly for a constant-acceleration launch.
 * - Duplicate fixes (same timestamp) are ignored so they never corrupt the
 *   interpolation.
 */
export class MeasurementEngine {
  private config: MeasurementConfig;
  private state: EngineState = "WAIT_ZERO";

  private previousSample: LocationSample | null = null;
  private zeroDetectedTime = 0;
  private launchTime = 0;
  private launchRefined = false;
  /** Last sample with raw speed below the launch speed (vehicle standing). */
  private lastStandingSample: LocationSample | null = null;
  /** Samples from the launch sample onwards. */
  private runSamples: LocationSample[] = [];
  private maxGapMs = 0;
  private quality = { hAccSum: 0, sAccSum: 0, sAccCount: 0, count: 0 };

  constructor(config: MeasurementConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  getState(): EngineState {
    return this.state;
  }

  getLaunchTime(): number {
    return this.launchTime;
  }

  /** Arm in automatic mode: wait for the vehicle to stand still first. */
  armAuto(): void {
    this.reset();
    this.state = "WAIT_ZERO";
  }

  /** Arm in manual mode: the next movement starts the clock. */
  armManual(): void {
    this.reset();
    this.state = "RUNNING";
  }

  /** Manual confirmation that the vehicle is stopped. */
  confirmZero(): boolean {
    if (this.state !== "WAIT_ZERO") return false;
    this.state = "RUNNING";
    return true;
  }

  reset(): void {
    this.state = "WAIT_ZERO";
    this.previousSample = null;
    this.zeroDetectedTime = 0;
    this.launchTime = 0;
    this.launchRefined = false;
    this.lastStandingSample = null;
    this.runSamples = [];
    this.maxGapMs = 0;
    this.quality = { hAccSum: 0, sAccSum: 0, sAccCount: 0, count: 0 };
  }

  processSample(sample: LocationSample): EngineEvent[] {
    const events: EngineEvent[] = [];
    const prev = this.previousSample;

    // Ignore repeated fixes: some platforms re-deliver the same position.
    if (prev && sample.timestamp <= prev.timestamp) {
      return events;
    }

    if (this.state === "DONE") {
      return events;
    }

    if (sample.isValid) {
      this.quality.hAccSum += sample.horizontalAccuracy;
      if (sample.speedAccuracy !== undefined) {
        this.quality.sAccSum += sample.speedAccuracy;
        this.quality.sAccCount++;
      }
      this.quality.count++;
    }

    if (this.launchTime === 0 && sample.speed < this.config.launchSpeedMps) {
      this.lastStandingSample = sample;
    }

    if (this.state === "WAIT_ZERO") {
      this.handleWaitZero(sample, events);
    } else if (this.state === "RUNNING") {
      this.handleRunning(sample, prev, events);
    }

    this.previousSample = sample;
    return events;
  }

  private handleWaitZero(sample: LocationSample, events: EngineEvent[]): void {
    if (sample.speedFiltered < this.config.zeroThreshold) {
      if (this.zeroDetectedTime === 0) {
        this.zeroDetectedTime = sample.timestamp;
      } else if (sample.timestamp - this.zeroDetectedTime >= this.config.zeroHoldTime) {
        this.state = "RUNNING";
        events.push({ type: "zero-confirmed" });
      }
    } else {
      this.zeroDetectedTime = 0;
    }
  }

  private handleRunning(
    sample: LocationSample,
    prev: LocationSample | null,
    events: EngineEvent[]
  ): void {
    const { targetSpeedMps, zeroThreshold, hysteresis, maxSampleGapMs } = this.config;

    // Launch detection: first raw sample clearly above standstill noise.
    if (this.launchTime === 0) {
      if (sample.speed > zeroThreshold + hysteresis) {
        this.launchTime = this.estimateLaunchFromInterpolation(sample, prev);
        events.push({ type: "launch", launchTime: this.launchTime, sampleTime: sample.timestamp });
      } else {
        return;
      }
    } else if (!this.launchRefined) {
      // Second moving sample: extrapolate the acceleration back to the launch speed.
      const refined = this.estimateLaunchFromExtrapolation(sample);
      this.launchRefined = true;
      if (refined !== null && refined !== this.launchTime) {
        this.launchTime = refined;
        events.push({ type: "launch-refined", launchTime: refined, sampleTime: sample.timestamp });
      }
    }

    this.runSamples.push(sample);

    // Sample gap monitoring (1 Hz GPS is normal, longer gaps hurt precision).
    if (prev) {
      const gapMs = sample.timestamp - prev.timestamp;
      if (gapMs > this.maxGapMs) this.maxGapMs = gapMs;
      if (gapMs > maxSampleGapMs) {
        events.push({ type: "signal-gap", gapMs });
      }
    }

    // Target crossing on raw speed, interpolated between samples.
    if (sample.speed >= targetSpeedMps) {
      let tHit = sample.timestamp;
      if (prev && prev.speed < targetSpeedMps) {
        tHit = interpolateTargetCrossing(
          prev.timestamp,
          prev.speed,
          sample.timestamp,
          sample.speed,
          targetSpeedMps
        );
      }
      this.state = "DONE";
      events.push({ type: "target", result: this.buildResult(tHit, sample) });
    }
  }

  /**
   * First estimate: linear interpolation to the launch speed on the segment
   * between the last standing sample and the first moving one.
   */
  private estimateLaunchFromInterpolation(sample: LocationSample, prev: LocationSample | null): number {
    const { launchSpeedMps } = this.config;
    const from = this.lastStandingSample ?? prev;
    if (!from) return sample.timestamp;
    const t = interpolateTargetCrossing(from.timestamp, from.speed, sample.timestamp, sample.speed, launchSpeedMps);
    return clamp(t, from.timestamp, sample.timestamp);
  }

  /**
   * Refined estimate: use the acceleration between the first two moving
   * samples and extrapolate back to the launch speed. The result is bounded
   * by the last standing sample and the first moving sample, because the
   * launch can only have happened in that window.
   */
  private estimateLaunchFromExtrapolation(second: LocationSample): number | null {
    const { launchSpeedMps } = this.config;
    const first = this.runSamples[0];
    if (!first) return null;
    const dt = (second.timestamp - first.timestamp) / 1000;
    const accel = (second.speed - first.speed) / dt;
    if (!(accel > 0)) return null;

    const t = first.timestamp - ((first.speed - launchSpeedMps) / accel) * 1000;
    const lower = this.lastStandingSample ? this.lastStandingSample.timestamp : t;
    return clamp(t, lower, first.timestamp);
  }

  private buildResult(tHit: number, crossingSample: LocationSample): MeasurementResult {
    const { targetSpeedMps, launchSpeedMps } = this.config;
    const launchTime = this.launchTime;
    const finalTime = (tHit - launchTime) / 1000;

    // Speed curve: launch point, every run sample, exact crossing point.
    const speedPoints: SpeedPoint[] = [{ time: 0, speed: roundTo(mpsToKmh(launchSpeedMps), 1) }];
    for (const s of this.runSamples) {
      if (s.timestamp <= launchTime || s.timestamp >= tHit) continue;
      speedPoints.push({
        time: roundTo((s.timestamp - launchTime) / 1000, 3),
        speed: roundTo(mpsToKmh(s.speed), 1),
      });
    }
    speedPoints.push({ time: roundTo(finalTime, 3), speed: roundTo(mpsToKmh(targetSpeedMps), 1) });

    // Distance: trapezoidal integration over the same curve (raw speeds).
    const curve = [
      { t: launchTime, v: launchSpeedMps },
      ...this.runSamples
        .filter((s) => s.timestamp > launchTime && s.timestamp < tHit)
        .map((s) => ({ t: s.timestamp, v: s.speed })),
      { t: tHit, v: targetSpeedMps },
    ];
    let distance = 0;
    for (let i = 1; i < curve.length; i++) {
      const dt = (curve[i].t - curve[i - 1].t) / 1000;
      distance += ((curve[i - 1].v + curve[i].v) / 2) * dt;
    }

    return {
      timeSeconds: finalTime,
      distanceMeters: Math.max(0, distance),
      finalSpeed: crossingSample.speed,
      avgHorizontalAccuracy: this.quality.count > 0 ? this.quality.hAccSum / this.quality.count : 0,
      avgSpeedAccuracy: this.quality.sAccCount > 0 ? this.quality.sAccSum / this.quality.sAccCount : 0,
      sampleCount: this.quality.count,
      startTime: launchTime,
      endTime: tHit,
      speedPoints,
      maxSampleGapMs: this.maxGapMs,
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
