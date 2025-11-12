import { useState, useEffect, useRef, useCallback } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { MeasurementState, LocationSample, MeasurementResult, DEFAULT_CONFIG } from "@/types/measurement";
import { SpeedFilter } from "@/utils/filters";
import { CsvLogger } from "@/utils/csvLogger";
import { interpolateTargetCrossing, mpsToKmh } from "@/utils/interpolation";
import { toast } from "@/hooks/use-toast";

/**
 * Core hook for 0-100 km/h measurement logic
 */
export function useMeasurement() {
  const [state, setState] = useState<MeasurementState>("IDLE");
  const [currentSpeed, setCurrentSpeed] = useState(0); // filtered speed in m/s
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [result, setResult] = useState<MeasurementResult | null>(null);
  const [signalQuality, setSignalQuality] = useState<"good" | "medium" | "poor">("good");

  const speedFilter = useRef(new SpeedFilter(DEFAULT_CONFIG.medianWindowSize, DEFAULT_CONFIG.emaAlpha));
  const csvLogger = useRef(new CsvLogger());
  const watchId = useRef<string | null>(null);
  
  const startTimeRef = useRef<number>(0);
  const zeroDetectedTimeRef = useRef<number>(0);
  const lastValidSampleTimeRef = useRef<number>(0);
  const previousSampleRef = useRef<LocationSample | null>(null);
  const distanceAccumulatorRef = useRef<number>(0);
  
  const qualityMetricsRef = useRef({ hAccSum: 0, sAccSum: 0, count: 0 });

  // Check if sample meets quality thresholds
  const isSampleValid = useCallback((sample: Partial<LocationSample>): boolean => {
    if (sample.horizontalAccuracy === undefined || sample.horizontalAccuracy > DEFAULT_CONFIG.horizontalAccuracyThreshold) {
      return false;
    }
    if (sample.speedAccuracy !== undefined && sample.speedAccuracy > DEFAULT_CONFIG.speedAccuracyThreshold) {
      return false;
    }
    return true;
  }, []);

  // Process incoming GPS sample
  const processSample = useCallback((position: any) => {
    const now = Date.now();
    const rawSpeed = position.coords.speed ?? 0;
    const filteredSpeed = speedFilter.current.filter(Math.max(0, rawSpeed));

    const sample: LocationSample = {
      timestamp: now,
      speed: rawSpeed,
      speedFiltered: filteredSpeed,
      horizontalAccuracy: position.coords.accuracy,
      speedAccuracy: (position.coords as any).speedAccuracy, // Not standard but available on some platforms
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      isValid: isSampleValid({
        horizontalAccuracy: position.coords.accuracy,
        speedAccuracy: (position.coords as any).speedAccuracy,
      }),
    };

    // Update quality metrics
    if (sample.isValid) {
      qualityMetricsRef.current.hAccSum += sample.horizontalAccuracy;
      if (sample.speedAccuracy) {
        qualityMetricsRef.current.sAccSum += sample.speedAccuracy;
      }
      qualityMetricsRef.current.count++;

      const avgHAcc = qualityMetricsRef.current.hAccSum / qualityMetricsRef.current.count;
      setSignalQuality(
        avgHAcc < 5 ? "good" : avgHAcc < 8 ? "medium" : "poor"
      );
    }

    setCurrentSpeed(filteredSpeed);
    setCurrentSpeedKmh(mpsToKmh(filteredSpeed));
    setSampleCount((prev) => prev + 1);
    csvLogger.current.addSample(sample, state);
    lastValidSampleTimeRef.current = now;

    // State machine transitions
    setState((currentState) => {
      if (currentState === "WAIT_ZERO") {
        // Check if vehicle is at zero (removed sample.isValid requirement for better detection)
        if (filteredSpeed < DEFAULT_CONFIG.zeroThreshold) {
          if (zeroDetectedTimeRef.current === 0) {
            zeroDetectedTimeRef.current = now;
          } else if (now - zeroDetectedTimeRef.current >= DEFAULT_CONFIG.zeroHoldTime) {
            // Zero confirmed for required duration
            toast({
              title: "✅ Veículo parado detectado",
              description: "Acelere para iniciar a medição!",
            });
            Haptics.impact({ style: ImpactStyle.Medium });
            return "RUNNING"; // Next sample will trigger start
          }
        } else {
          // Reset zero detection if speed goes above threshold
          zeroDetectedTimeRef.current = 0;
        }
      } else if (currentState === "RUNNING") {
        // Start timer on first sample above threshold
        if (startTimeRef.current === 0 && filteredSpeed > DEFAULT_CONFIG.zeroThreshold + DEFAULT_CONFIG.hysteresis) {
          startTimeRef.current = now;
          csvLogger.current.start(now);
          distanceAccumulatorRef.current = 0;
          toast({
            title: "Cronômetro iniciado!",
            description: "Medição em andamento...",
          });
        }

        // Accumulate distance
        if (previousSampleRef.current && startTimeRef.current > 0) {
          const dt = (now - previousSampleRef.current.timestamp) / 1000; // seconds
          distanceAccumulatorRef.current += filteredSpeed * dt;
        }

        // Check for target crossing
        if (
          sample.isValid &&
          previousSampleRef.current &&
          previousSampleRef.current.speedFiltered < DEFAULT_CONFIG.targetSpeedMps &&
          filteredSpeed >= DEFAULT_CONFIG.targetSpeedMps
        ) {
          // Interpolate exact crossing time
          const tHit = interpolateTargetCrossing(
            previousSampleRef.current.timestamp,
            previousSampleRef.current.speedFiltered,
            now,
            filteredSpeed,
            DEFAULT_CONFIG.targetSpeedMps
          );

          const finalTime = (tHit - startTimeRef.current) / 1000; // seconds

          const avgHAcc = qualityMetricsRef.current.count > 0
            ? qualityMetricsRef.current.hAccSum / qualityMetricsRef.current.count
            : 0;
          const avgSAcc = qualityMetricsRef.current.count > 0
            ? qualityMetricsRef.current.sAccSum / qualityMetricsRef.current.count
            : 0;

          const measurementResult: MeasurementResult = {
            timeSeconds: finalTime,
            distanceMeters: distanceAccumulatorRef.current,
            finalSpeed: filteredSpeed,
            avgHorizontalAccuracy: avgHAcc,
            avgSpeedAccuracy: avgSAcc,
            sampleCount: qualityMetricsRef.current.count,
            startTime: startTimeRef.current,
            endTime: tHit,
          };

          setResult(measurementResult);

          // Feedback
          Haptics.impact({ style: ImpactStyle.Heavy });
          toast({
            title: "🏁 Medição concluída!",
            description: `100 km/h em ${finalTime.toFixed(2)} segundos`,
            duration: 5000,
          });

          // Voice feedback using Web Speech API
          try {
            const utterance = new SpeechSynthesisUtterance(
              `Cem quilômetros por hora em ${finalTime.toFixed(1)} segundos`
            );
            utterance.lang = "pt-BR";
            speechSynthesis.speak(utterance);
          } catch (error) {
            if (import.meta.env.DEV) {
              console.warn("Speech synthesis not available:", error);
            }
          }

          return "DONE";
        }

        // Check for sample gap timeout
        if (startTimeRef.current > 0 && now - lastValidSampleTimeRef.current > DEFAULT_CONFIG.maxSampleGapMs) {
          toast({
            title: "⚠️ Medição abortada",
            description: "Perda de sinal GPS durante medição",
            variant: "destructive",
          });
          Haptics.impact({ style: ImpactStyle.Heavy });
          return "DONE";
        }
      }

      return currentState;
    });

    previousSampleRef.current = sample;
  }, [state, isSampleValid]);

  // Start GPS watching
  const startWatching = useCallback(async () => {
    try {
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== "granted") {
        const request = await Geolocation.requestPermissions();
        if (request.location !== "granted") {
          toast({
            title: "Permissão necessária",
            description: "Acesso à localização é necessário para medição GPS",
            variant: "destructive",
          });
          return;
        }
      }

      watchId.current = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        },
        (position) => {
          if (position) processSample(position);
        }
      );
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Error starting GPS:", error);
      }
      toast({
        title: "Erro GPS",
        description: "Não foi possível iniciar o GPS",
        variant: "destructive",
      });
    }
  }, [processSample]);

  // Stop GPS watching
  const stopWatching = useCallback(async () => {
    if (watchId.current) {
      await Geolocation.clearWatch({ id: watchId.current });
      watchId.current = null;
    }
  }, []);

  // Arm measurement
  const arm = useCallback(async () => {
    csvLogger.current.reset();
    speedFilter.current.reset();
    startTimeRef.current = 0;
    zeroDetectedTimeRef.current = 0;
    previousSampleRef.current = null;
    distanceAccumulatorRef.current = 0;
    qualityMetricsRef.current = { hAccSum: 0, sAccSum: 0, count: 0 };
    setSampleCount(0);
    setResult(null);

    setState("ARMED");
    await startWatching();
    
    Haptics.impact({ style: ImpactStyle.Medium });
    toast({
      title: "Sistema armado",
      description: "Aguardando veículo parado...",
    });

    // Transition to WAIT_ZERO
    setTimeout(() => setState("WAIT_ZERO"), 500);
  }, [startWatching]);

  // Manual zero confirmation
  const confirmZero = useCallback(() => {
    if (state === "WAIT_ZERO") {
      setState("RUNNING");
      toast({
        title: "✅ Veículo parado confirmado",
        description: "Acelere para iniciar a medição!",
      });
      Haptics.impact({ style: ImpactStyle.Medium });
    }
  }, [state]);

  // Reset measurement
  const reset = useCallback(async () => {
    await stopWatching();
    setState("IDLE");
    setCurrentSpeed(0);
    setCurrentSpeedKmh(0);
    setSampleCount(0);
    setResult(null);
    csvLogger.current.reset();
    Haptics.impact({ style: ImpactStyle.Light });
  }, [stopWatching]);

  // Export CSV
  const exportCsv = useCallback(async () => {
    try {
      await csvLogger.current.exportCsv(`0-100_${Date.now()}.csv`);
      toast({
        title: "CSV exportado",
        description: "Arquivo salvo com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar o CSV",
        variant: "destructive",
      });
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWatching();
    };
  }, [stopWatching]);

  return {
    state,
    currentSpeed,
    currentSpeedKmh,
    sampleCount,
    result,
    signalQuality,
    arm,
    reset,
    confirmZero,
    exportCsv,
  };
}
