import { useState, useEffect, useRef, useCallback } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";
import { MeasurementState, LocationSample, MeasurementResult, DEFAULT_CONFIG } from "@/types/measurement";
import { KalmanFilter } from "@/utils/filters";
import { CsvLogger } from "@/utils/csvLogger";
import { MeasurementEngine, EngineEvent } from "@/lib/measurementEngine";
import { mpsToKmh } from "@/utils/interpolation";
import { toast } from "@/hooks/use-toast";

/** Minimal shape shared by Capacitor's Position and the browser's GeolocationPosition. */
interface GpsPosition {
  timestamp: number;
  coords: {
    speed: number | null;
    accuracy: number;
    speedAccuracy?: number | null;
    latitude: number;
    longitude: number;
  };
}

// Helper to trigger haptics safely
const triggerHaptics = async (style: ImpactStyle) => {
  if (Capacitor.isNativePlatform()) {
    try {
      await Haptics.impact({ style });
    } catch (error) {
      console.log("Haptics not available:", error);
    }
  }
};

// If no fix arrives for this long during a run, warn the driver.
const GPS_WATCHDOG_MS = 3000;

/**
 * Core hook for 0-100 km/h measurement logic.
 * GPS lifecycle, toasts and haptics live here; the timing itself lives in
 * MeasurementEngine so it can be unit tested.
 */
export function useMeasurement(isManualMode = false) {
  const [state, setState] = useState<MeasurementState>("IDLE");
  const [currentSpeed, setCurrentSpeed] = useState(0); // filtered speed in m/s
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [result, setResult] = useState<MeasurementResult | null>(null);
  const [signalQuality, setSignalQuality] = useState<"good" | "medium" | "poor">("good");
  const [gpsValid, setGpsValid] = useState(false);
  // Wall-clock (Date.now based) instant of the launch, for the live timer.
  const [launchWallTime, setLaunchWallTime] = useState<number | null>(null);

  const stateRef = useRef<MeasurementState>("IDLE");
  const engine = useRef(new MeasurementEngine(DEFAULT_CONFIG));
  const speedFilter = useRef(new KalmanFilter(0.5)); // Process noise = 0.5 m/s²
  const csvLogger = useRef(new CsvLogger());
  const watchId = useRef<string | number | null>(null); // string for Capacitor, number for browser
  const isNative = useRef(Capacitor.isNativePlatform());
  const lastSampleWallTimeRef = useRef<number>(0);
  const gapWarnedRef = useRef(false);
  const qualityMetricsRef = useRef({ hAccSum: 0, count: 0 });

  const changeState = useCallback((next: MeasurementState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // Check if sample meets quality thresholds
  const isSampleValid = useCallback((horizontalAccuracy: number, speedAccuracy?: number): boolean => {
    if (horizontalAccuracy === undefined || horizontalAccuracy > DEFAULT_CONFIG.horizontalAccuracyThreshold) {
      return false;
    }
    if (speedAccuracy !== undefined && speedAccuracy > DEFAULT_CONFIG.speedAccuracyThreshold) {
      return false;
    }
    return true;
  }, []);

  // Stop GPS watching
  const stopWatching = useCallback(async () => {
    if (watchId.current !== null) {
      const id = watchId.current;
      watchId.current = null;
      if (isNative.current) {
        await Geolocation.clearWatch({ id: id as string });
      } else {
        navigator.geolocation.clearWatch(id as number);
      }
    }
  }, []);

  const finishWithResult = useCallback(
    (measurementResult: MeasurementResult) => {
      setResult(measurementResult);
      changeState("DONE");
      stopWatching();

      const finalTime = measurementResult.timeSeconds;
      triggerHaptics(ImpactStyle.Heavy);
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
    },
    [changeState, stopWatching]
  );

  const handleEngineEvents = useCallback(
    (events: EngineEvent[], sample: LocationSample) => {
      for (const event of events) {
        switch (event.type) {
          case "zero-confirmed":
            changeState("RUNNING");
            toast({
              title: "✅ Veículo parado detectado",
              description: "Acelere para iniciar a medição!",
            });
            triggerHaptics(ImpactStyle.Medium);
            break;
          case "launch":
          case "launch-refined": {
            // Translate the GPS-clock launch instant into wall-clock time so the
            // on-screen timer stays in sync regardless of GPS clock offset.
            const gpsAge = sample.timestamp - event.launchTime;
            setLaunchWallTime(Date.now() - gpsAge);
            csvLogger.current.start(event.launchTime);
            if (event.type === "launch") {
              toast({
                title: "Cronômetro iniciado!",
                description: "Medição em andamento...",
              });
            }
            break;
          }
          case "signal-gap":
            if (!gapWarnedRef.current) {
              gapWarnedRef.current = true;
              toast({
                title: "⚠️ Sinal GPS irregular",
                description: `Intervalo de ${(event.gapMs / 1000).toFixed(1)}s entre leituras. O resultado pode perder precisão.`,
                variant: "destructive",
              });
            }
            break;
          case "target":
            finishWithResult(event.result);
            break;
        }
      }
    },
    [changeState, finishWithResult]
  );

  // Process incoming GPS sample
  const processSample = useCallback(
    (position: GpsPosition) => {
      // Ignore late callbacks after the watch was stopped (e.g. right after DONE).
      if (watchId.current === null) return;

      lastSampleWallTimeRef.current = Date.now();

      // Mark GPS as connected (even if speed is null)
      setGpsValid(true);

      // Ignore samples with null speed: the fix has no Doppler speed yet.
      if (position.coords.speed === null || position.coords.speed === undefined) {
        setSampleCount((prev) => prev + 1);
        return;
      }

      // Use the fix time, not the callback time: delivery jitter must not leak into the result.
      const timestamp =
        typeof position.timestamp === "number" && Number.isFinite(position.timestamp) && position.timestamp > 0
          ? position.timestamp
          : Date.now();

      const rawSpeed = Math.max(0, position.coords.speed);
      const speedAccuracy =
        position.coords.speedAccuracy === null || position.coords.speedAccuracy === undefined
          ? undefined
          : position.coords.speedAccuracy;
      const filteredSpeed = speedFilter.current.filter(rawSpeed, timestamp, speedAccuracy);

      const sample: LocationSample = {
        timestamp,
        speed: rawSpeed,
        speedFiltered: filteredSpeed,
        horizontalAccuracy: position.coords.accuracy,
        speedAccuracy,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        isValid: isSampleValid(position.coords.accuracy, speedAccuracy),
      };

      // Update quality metrics for the signal indicator
      if (sample.isValid) {
        qualityMetricsRef.current.hAccSum += sample.horizontalAccuracy;
        qualityMetricsRef.current.count++;
        const avgHAcc = qualityMetricsRef.current.hAccSum / qualityMetricsRef.current.count;
        setSignalQuality(avgHAcc < 5 ? "good" : avgHAcc < 8 ? "medium" : "poor");
      }

      setCurrentSpeed(filteredSpeed);
      setCurrentSpeedKmh(mpsToKmh(filteredSpeed));
      setSampleCount((prev) => prev + 1);
      csvLogger.current.addSample(sample, stateRef.current);

      const currentState = stateRef.current;
      if (currentState !== "WAIT_ZERO" && currentState !== "RUNNING") {
        return;
      }

      const events = engine.current.processSample(sample);
      if (events.length > 0) {
        handleEngineEvents(events, sample);
      }
    },
    [isSampleValid, handleEngineEvents]
  );

  // Keep the GPS callback pointing at the latest processSample without restarting the watch.
  const processSampleRef = useRef(processSample);
  useEffect(() => {
    processSampleRef.current = processSample;
  }, [processSample]);

  // Start GPS watching
  const startWatching = useCallback(async () => {
    try {
      if (isNative.current) {
        // Use Capacitor Geolocation for native apps
        const permission = await Geolocation.checkPermissions();

        if (permission.location !== "granted") {
          const request = await Geolocation.requestPermissions();

          if (request.location !== "granted") {
            toast({
              title: "Permissão necessária",
              description: "Acesso à localização é necessário para medição GPS",
              variant: "destructive",
            });
            return false;
          }
        }

        watchId.current = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          },
          (position) => {
            if (position) processSampleRef.current(position);
          }
        );
      } else {
        // Use browser Geolocation API
        if (!navigator.geolocation) {
          throw new Error("Geolocation not supported by browser");
        }

        watchId.current = navigator.geolocation.watchPosition(
          (position) => {
            processSampleRef.current(position);
          },
          (error) => {
            console.error("❌ Browser GPS error:", error);
            toast({
              title: "Erro GPS",
              description: error.message || "Não foi possível acessar o GPS",
              variant: "destructive",
            });
          },
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          }
        );
      }
      return true;
    } catch (error) {
      console.error("❌ Error starting GPS:", error);
      toast({
        title: "Erro GPS",
        description: "Não foi possível iniciar o GPS",
        variant: "destructive",
      });
      return false;
    }
  }, []);

  // Arm measurement
  const arm = useCallback(async () => {
    csvLogger.current.reset();
    speedFilter.current.reset();
    qualityMetricsRef.current = { hAccSum: 0, count: 0 };
    gapWarnedRef.current = false;
    lastSampleWallTimeRef.current = 0;
    setSampleCount(0);
    setResult(null);
    setLaunchWallTime(null);

    changeState("ARMED");

    const started = await startWatching();
    if (!started) {
      changeState("IDLE");
      return;
    }

    triggerHaptics(ImpactStyle.Medium);

    if (isManualMode) {
      // Modo manual: o cronômetro dispara na primeira movimentação
      engine.current.armManual();
      changeState("RUNNING");
      toast({
        title: "Medição iniciada (Manual)",
        description: "Acelere para registrar 0-100 km/h",
      });
    } else {
      // Modo automático: aguarda detectar zero
      engine.current.armAuto();
      changeState("WAIT_ZERO");
      toast({
        title: "Sistema armado",
        description: "Aguardando veículo parado...",
      });
    }
  }, [startWatching, isManualMode, changeState]);

  // Manual zero confirmation - requires a GPS reading first
  const confirmZero = useCallback(() => {
    if (stateRef.current !== "WAIT_ZERO") return;

    if (lastSampleWallTimeRef.current === 0) {
      toast({
        title: "⚠️ Aguardando GPS",
        description: "Aguarde até receber uma leitura válida do GPS",
        variant: "destructive",
      });
      return;
    }

    if (engine.current.confirmZero()) {
      changeState("RUNNING");
      triggerHaptics(ImpactStyle.Medium);
      toast({
        title: "Medição iniciada",
        description: "Acelere para registrar 0-100 km/h",
      });
    }
  }, [changeState]);

  // Cancel measurement
  const cancel = useCallback(async () => {
    await stopWatching();
    changeState("IDLE");
    setCurrentSpeed(0);
    setCurrentSpeedKmh(0);
    setSampleCount(0);
    setLaunchWallTime(null);
    csvLogger.current.reset();
    triggerHaptics(ImpactStyle.Medium);
    toast({
      title: "Medição cancelada",
      description: "Sistema retornando ao estado inicial",
    });
  }, [stopWatching, changeState]);

  // Reset measurement
  const reset = useCallback(async () => {
    await stopWatching();
    changeState("IDLE");
    setCurrentSpeed(0);
    setCurrentSpeedKmh(0);
    setSampleCount(0);
    setResult(null);
    setLaunchWallTime(null);
    csvLogger.current.reset();
    triggerHaptics(ImpactStyle.Light);
  }, [stopWatching, changeState]);

  // Export CSV
  const exportCsv = useCallback(async () => {
    try {
      await csvLogger.current.exportCsv(`0-100_${Date.now()}.csv`);
      toast({
        title: "CSV exportado",
        description: "Arquivo salvo com sucesso",
      });
    } catch {
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar o CSV",
        variant: "destructive",
      });
    }
  }, []);

  // Watchdog: warn if the GPS goes quiet during a run.
  useEffect(() => {
    if (state !== "RUNNING") return;
    const interval = setInterval(() => {
      const last = lastSampleWallTimeRef.current;
      if (last > 0 && Date.now() - last > GPS_WATCHDOG_MS && !gapWarnedRef.current) {
        gapWarnedRef.current = true;
        toast({
          title: "⚠️ Sem leituras do GPS",
          description: "Nenhuma posição recebida nos últimos segundos. Verifique o sinal.",
          variant: "destructive",
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

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
    gpsValid,
    launchWallTime,
    arm,
    reset,
    cancel,
    confirmZero,
    exportCsv,
  };
}
