import { describe, it, expect } from "vitest";
import { MeasurementEngine, EngineEvent } from "./measurementEngine";
import { DEFAULT_CONFIG, LocationSample } from "@/types/measurement";

const T0 = 1_700_000_000_000; // arbitrary GPS epoch in ms

function sample(timestamp: number, speed: number, overrides: Partial<LocationSample> = {}): LocationSample {
  return {
    timestamp,
    speed,
    speedFiltered: speed,
    horizontalAccuracy: 5,
    speedAccuracy: 0.3,
    latitude: 0,
    longitude: 0,
    isValid: true,
    ...overrides,
  };
}

/** Feed a constant-acceleration run sampled at `intervalMs`, starting to move at `launchAt`. */
function runConstantAcceleration(
  engine: MeasurementEngine,
  accel: number,
  launchAt: number,
  intervalMs = 1000,
  phaseMs = 0
): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (let t = T0 + phaseMs; t < launchAt + 60_000; t += intervalMs) {
    const v = t <= launchAt ? 0 : accel * ((t - launchAt) / 1000);
    events.push(...engine.processSample(sample(t, v)));
    if (engine.getState() === "DONE") break;
  }
  return events;
}

function targetEvent(events: EngineEvent[]) {
  const ev = events.find((e) => e.type === "target");
  if (!ev || ev.type !== "target") throw new Error("no target event");
  return ev.result;
}

describe("MeasurementEngine timing", () => {
  const { targetSpeedMps, launchSpeedMps } = DEFAULT_CONFIG;

  it("interpolates launch and 100 km/h crossing from raw speed at 1 Hz", () => {
    const engine = new MeasurementEngine();
    engine.armManual();
    const accel = 3.2; // m/s² (~8.6 s to 100 km/h)
    const launchAt = T0 + 2300; // launch between two samples

    const result = targetEvent(runConstantAcceleration(engine, accel, launchAt));

    const expected = (targetSpeedMps - launchSpeedMps) / accel;
    expect(Math.abs(result.timeSeconds - expected)).toBeLessThan(0.001);
    expect(Math.abs(result.startTime - (launchAt + (launchSpeedMps / accel) * 1000))).toBeLessThan(1);
    expect(Math.abs(result.endTime - (launchAt + (targetSpeedMps / accel) * 1000))).toBeLessThan(1);
  });

  it("gives the same time regardless of sample phase", () => {
    const accel = 2.5;
    const launchAt = T0 + 5000;
    const times = [0, 130, 470, 810].map((phase) => {
      const engine = new MeasurementEngine();
      engine.armManual();
      return targetEvent(runConstantAcceleration(engine, accel, launchAt, 1000, phase)).timeSeconds;
    });
    for (const t of times) {
      expect(Math.abs(t - times[0])).toBeLessThan(0.001);
    }
  });

  it("uses GPS fix timestamps and ignores duplicated fixes", () => {
    const engine = new MeasurementEngine();
    engine.armManual();
    engine.processSample(sample(T0, 0));
    engine.processSample(sample(T0 + 1000, 0));
    engine.processSample(sample(T0 + 1000, 0)); // duplicate
    const launch = engine.processSample(sample(T0 + 2000, 2));
    expect(launch.some((e) => e.type === "launch")).toBe(true);
    // prev was (T0+1000, 0) -> first estimate interpolated to 1 km/h on that segment
    expect(engine.getLaunchTime()).toBeCloseTo(T0 + 1000 + (launchSpeedMps / 2) * 1000, 0);

    const refined = engine.processSample(sample(T0 + 3000, 20));
    // acceleration 18 m/s² between the two moving samples -> launch extrapolated back from (2000, 2)
    const expectedLaunch = T0 + 2000 - ((2 - launchSpeedMps) / 18) * 1000;
    expect(refined).toContainEqual({ type: "launch-refined", launchTime: expectedLaunch, sampleTime: T0 + 3000 });
    expect(engine.getLaunchTime()).toBe(expectedLaunch);
    const dup = engine.processSample(sample(T0 + 3000, 30)); // duplicate timestamp, must be ignored
    expect(dup).toEqual([]);
    expect(engine.getState()).toBe("RUNNING");

    const result = targetEvent(engine.processSample(sample(T0 + 4000, 30)));
    // crossing interpolated between (3000, 20) and (4000, 30)
    const expectedHit = T0 + 3000 + ((targetSpeedMps - 20) / 10) * 1000;
    expect(Math.abs(result.endTime - expectedHit)).toBeLessThan(0.5);
  });

  it("never places the launch before the last standing sample", () => {
    const engine = new MeasurementEngine();
    engine.armManual();
    engine.processSample(sample(T0, 0));
    engine.processSample(sample(T0 + 1000, 0));
    engine.processSample(sample(T0 + 2000, 1)); // launch sample
    // Huge acceleration on the next segment would extrapolate before T0+1000
    engine.processSample(sample(T0 + 3000, 25));
    expect(engine.getLaunchTime()).toBeGreaterThanOrEqual(T0 + 1000);
    expect(engine.getLaunchTime()).toBeLessThanOrEqual(T0 + 2000);
  });

  it("does not let filtered-speed lag delay the crossing", () => {
    const engine = new MeasurementEngine();
    engine.armManual();
    engine.processSample(sample(T0, 0, { speedFiltered: 0 }));
    engine.processSample(sample(T0 + 1000, 5, { speedFiltered: 3 }));
    engine.processSample(sample(T0 + 2000, 26, { speedFiltered: 22 }));
    // raw crosses 100 km/h here, filtered still below
    const events = engine.processSample(sample(T0 + 3000, 29, { speedFiltered: 26 }));
    expect(events.some((e) => e.type === "target")).toBe(true);
  });

  it("stops processing after DONE", () => {
    const engine = new MeasurementEngine();
    engine.armManual();
    runConstantAcceleration(engine, 4, T0 + 1000);
    expect(engine.getState()).toBe("DONE");
    expect(engine.processSample(sample(T0 + 120_000, 40))).toEqual([]);
  });
});

describe("MeasurementEngine automatic mode", () => {
  it("requires the vehicle to be stopped for zeroHoldTime before running", () => {
    const engine = new MeasurementEngine();
    engine.armAuto();
    expect(engine.processSample(sample(T0, 0.2))).toEqual([]);
    expect(engine.processSample(sample(T0 + 500, 0.1))).toEqual([]);
    expect(engine.getState()).toBe("WAIT_ZERO");
    const events = engine.processSample(sample(T0 + 1000, 0.1));
    expect(events).toEqual([{ type: "zero-confirmed" }]);
    expect(engine.getState()).toBe("RUNNING");
  });

  it("resets the standstill timer if the vehicle moves", () => {
    const engine = new MeasurementEngine();
    engine.armAuto();
    engine.processSample(sample(T0, 0.1));
    engine.processSample(sample(T0 + 600, 2, { speedFiltered: 2 }));
    expect(engine.processSample(sample(T0 + 1200, 0.1))).toEqual([]);
    expect(engine.getState()).toBe("WAIT_ZERO");
  });

  it("manual zero confirmation only works while waiting for zero", () => {
    const engine = new MeasurementEngine();
    engine.armManual();
    expect(engine.confirmZero()).toBe(false);
    engine.armAuto();
    expect(engine.confirmZero()).toBe(true);
    expect(engine.getState()).toBe("RUNNING");
  });
});

describe("MeasurementEngine signal quality", () => {
  it("reports gaps between fixes and keeps the run going", () => {
    const engine = new MeasurementEngine();
    engine.armManual();
    engine.processSample(sample(T0, 0));
    engine.processSample(sample(T0 + 1000, 3));
    const events = engine.processSample(sample(T0 + 3500, 12)); // 2.5 s gap
    expect(events).toContainEqual({ type: "signal-gap", gapMs: 2500 });
    expect(engine.getState()).toBe("RUNNING");
    const result = targetEvent(runConstantAcceleration(engine, 5, T0 + 3500 - 12 / 5 * 1000, 1000, 4500));
    expect(result.maxSampleGapMs).toBe(2500);
  });

  it("integrates distance up to the exact crossing", () => {
    const engine = new MeasurementEngine();
    engine.armManual();
    const accel = 3;
    const launchAt = T0 + 1000;
    const result = targetEvent(runConstantAcceleration(engine, accel, launchAt));
    // distance from launch speed to target under constant acceleration
    const { targetSpeedMps, launchSpeedMps } = DEFAULT_CONFIG;
    const expected = (targetSpeedMps ** 2 - launchSpeedMps ** 2) / (2 * accel);
    expect(Math.abs(result.distanceMeters - expected)).toBeLessThan(0.5);
    expect(result.speedPoints[0]).toEqual({ time: 0, speed: 1 });
    expect(result.speedPoints[result.speedPoints.length - 1].speed).toBe(100);
  });
});
