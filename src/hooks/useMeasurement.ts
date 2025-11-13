import { useState, useEffect, useRef, useCallback } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";
import { MeasurementState, LocationSample, MeasurementResult, DEFAULT_CONFIG } from "@/types/measurement";
import { SpeedFilter } from "@/utils/filters";
import { CsvLogger } from "@/utils/csvLogger";
import { interpolateTargetCrossing, mpsToKmh } from "@/utils/interpolation";
import { toast } from "@/hooks/use-toast";

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
  const [gpsValid, setGpsValid] = useState(false);

  const speedFilter = useRef(new SpeedFilter(DEFAULT_CONFIG.medianWindowSize, DEFAULT_CONFIG.emaAlpha));
  const csvLogger = useRef(new CsvLogger());
  const watchId = useRef<string | number | null>(null); // string for Capacitor, number for browser
  const isNative = useRef(Capacitor.isNativePlatform());
  
  const startTimeRef = useRef<number>(0);
  const zeroDetectedTimeRef = useRef<number>(0);
  const lastValidSampleTimeRef = useRef<number>(0);
  const previousSampleRef = useRef<LocationSample | null>(null);
  const distanceAccumulatorRef = useRef<number>(0);
  const speedPointsRef = useRef<Array<{ time: number; speed: number }>>([]);
  
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
    
    // Mark GPS as connected (even if speed is null)
    setGpsValid(true);
    
    // CRITICAL: Ignore samples with null speed for measurement processing
    if (position.coords.speed === null || position.coords.speed === undefined) {
      console.log("⚠️ GPS sample ignorada: speed null/undefined - aguardando leitura válida do GPS");
      // Increment sample count to show GPS is active, even if speed is null
      setSampleCount((prev) => prev + 1);
      return;
    }
    
    const rawSpeed = Math.max(0, position.coords.speed);
    const filteredSpeed = speedFilter.current.filter(rawSpeed);

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
      console.log(`🔄 processSample - Estado REAL: ${currentState}, Speed: ${filteredSpeed.toFixed(2)} m/s (${mpsToKmh(filteredSpeed).toFixed(1)} km/h)`);
      
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
            triggerHaptics(ImpactStyle.Medium);
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
          speedPointsRef.current = []; // Reset speed points
          console.log(`Timer started! Speed: ${filteredSpeed.toFixed(2)} m/s (${mpsToKmh(filteredSpeed).toFixed(1)} km/h)`);
          toast({
            title: "Cronômetro iniciado!",
            description: "Medição em andamento...",
          });
        }
        
        if (startTimeRef.current === 0) {
          console.log(`Waiting for speed > ${(DEFAULT_CONFIG.zeroThreshold + DEFAULT_CONFIG.hysteresis).toFixed(2)} m/s. Current: ${filteredSpeed.toFixed(2)} m/s`);
        }

        // Collect speed points for chart
        if (startTimeRef.current > 0) {
          const timeElapsed = (now - startTimeRef.current) / 1000; // seconds
          speedPointsRef.current.push({
            time: parseFloat(timeElapsed.toFixed(2)),
            speed: parseFloat(mpsToKmh(filteredSpeed).toFixed(1)),
          });
        }

        // Accumulate distance
        if (previousSampleRef.current && startTimeRef.current > 0) {
          const dt = (now - previousSampleRef.current.timestamp) / 1000; // seconds
          distanceAccumulatorRef.current += filteredSpeed * dt;
        }

        // Check for target crossing
        // Log detailed info for debugging
        if (previousSampleRef.current) {
          const prevSpeedKmh = mpsToKmh(previousSampleRef.current.speedFiltered).toFixed(1);
          const currSpeedKmh = mpsToKmh(filteredSpeed).toFixed(1);
          const targetKmh = mpsToKmh(DEFAULT_CONFIG.targetSpeedMps).toFixed(1);
          console.log(`🔍 Checking target: prev=${previousSampleRef.current.speedFiltered.toFixed(2)} m/s (${prevSpeedKmh} km/h), current=${filteredSpeed.toFixed(2)} m/s (${currSpeedKmh} km/h), target=${DEFAULT_CONFIG.targetSpeedMps.toFixed(2)} m/s (${targetKmh} km/h)`);
          console.log(`🔍 Condições: prev < target? ${previousSampleRef.current.speedFiltered < DEFAULT_CONFIG.targetSpeedMps}, current >= target? ${filteredSpeed >= DEFAULT_CONFIG.targetSpeedMps}`);
        }
        
        if (
          previousSampleRef.current &&
          previousSampleRef.current.speedFiltered < DEFAULT_CONFIG.targetSpeedMps &&
          filteredSpeed >= DEFAULT_CONFIG.targetSpeedMps
        ) {
          console.log(`🎯 TARGET CRUZADO! Detectado em ${mpsToKmh(filteredSpeed).toFixed(1)} km/h`);
          console.log(`📊 isValid: ${sample.isValid}, hAcc: ${sample.horizontalAccuracy.toFixed(1)}m, sAcc: ${sample.speedAccuracy?.toFixed(2) || 'N/A'}m/s`);
          
          toast({
            title: "🏁 100 km/h atingido!",
            description: "Medição completa!",
          });
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
            speedPoints: speedPointsRef.current,
          };

          setResult(measurementResult);

          // Feedback
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

          return "DONE";
        }

        // Check for sample gap timeout
        if (startTimeRef.current > 0 && now - lastValidSampleTimeRef.current > DEFAULT_CONFIG.maxSampleGapMs) {
          toast({
            title: "⚠️ Medição abortada",
            description: "Perda de sinal GPS durante medição",
            variant: "destructive",
          });
          triggerHaptics(ImpactStyle.Heavy);
          return "DONE";
        }
      }

      return currentState;
    });

    previousSampleRef.current = sample;
  }, [state, isSampleValid]);

  // Start GPS watching
  const startWatching = useCallback(async () => {
    console.log("🚀 startWatching() chamado");
    try {
      if (isNative.current) {
        // Use Capacitor Geolocation for native apps
        const permission = await Geolocation.checkPermissions();
        console.log("📍 GPS permission status:", permission.location);
        
        if (permission.location !== "granted") {
          console.log("⚠️ Solicitando permissão GPS...");
          const request = await Geolocation.requestPermissions();
          console.log("📍 Permissão GPS após request:", request.location);
          
          if (request.location !== "granted") {
            console.log("❌ Permissão GPS negada");
            toast({
              title: "Permissão necessária",
              description: "Acesso à localização é necessário para medição GPS",
              variant: "destructive",
            });
            return;
          }
        }

        console.log("✅ Iniciando GPS watch (Capacitor) com alta precisão...");
        watchId.current = await Geolocation.watchPosition(
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          },
          (position) => {
            console.log("📡 GPS sample recebido:", {
              speed: position?.coords?.speed,
              accuracy: position?.coords?.accuracy,
              timestamp: new Date().toISOString()
            });
            if (position) processSample(position);
          }
        );
        console.log("✅ GPS watch iniciado com ID:", watchId.current);
      } else {
        // Use browser Geolocation API
        if (!navigator.geolocation) {
          throw new Error("Geolocation not supported by browser");
        }

        console.log("✅ Iniciando GPS watch (Browser) com alta precisão...");
        watchId.current = navigator.geolocation.watchPosition(
          (position) => {
            console.log("📡 GPS sample recebido:", {
              speed: position?.coords?.speed,
              accuracy: position?.coords?.accuracy,
              timestamp: new Date().toISOString()
            });
            processSample(position);
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
        console.log("✅ GPS watch iniciado (Browser) com ID:", watchId.current);
      }
    } catch (error) {
      console.error("❌ Error starting GPS:", error);
      toast({
        title: "Erro GPS",
        description: "Não foi possível iniciar o GPS",
        variant: "destructive",
      });
    }
  }, [processSample]);

  // Stop GPS watching
  const stopWatching = useCallback(async () => {
    if (watchId.current !== null) {
      if (isNative.current) {
        await Geolocation.clearWatch({ id: watchId.current as string });
      } else {
        navigator.geolocation.clearWatch(watchId.current as number);
      }
      watchId.current = null;
    }
  }, []);

  // Arm measurement
  const arm = useCallback(async () => {
    console.log("🎯 ARM iniciado");
    csvLogger.current.reset();
    speedFilter.current.reset();
    startTimeRef.current = 0;
    zeroDetectedTimeRef.current = 0;
    previousSampleRef.current = null;
    distanceAccumulatorRef.current = 0;
    speedPointsRef.current = [];
    qualityMetricsRef.current = { hAccSum: 0, sAccSum: 0, count: 0 };
    setSampleCount(0);
    setResult(null);

    setState("ARMED");
    console.log("📊 Estado mudado para ARMED");
    
    await startWatching();
    
    triggerHaptics(ImpactStyle.Medium);
    toast({
      title: "Sistema armado",
      description: "Aguardando veículo parado...",
    });

    // Transition to WAIT_ZERO
    setTimeout(() => {
      console.log("📊 Estado mudando para WAIT_ZERO");
      setState("WAIT_ZERO");
    }, 500);
  }, [startWatching]);

  // Manual zero confirmation - requires valid GPS reading
  const confirmZero = useCallback(() => {
    setState((currentState) => {
      console.log("🚦 confirmZero chamado, estado atual:", currentState);
      if (currentState === "WAIT_ZERO") {
        // Validate that we have at least one valid GPS sample
        if (!previousSampleRef.current || previousSampleRef.current.speed === 0) {
          console.log("⚠️ Aguardando leitura válida do GPS antes de confirmar zero");
          toast({
            title: "⚠️ Aguardando GPS",
            description: "Aguarde até receber uma leitura válida do GPS",
            variant: "destructive",
          });
          return currentState;
        }
        
        // Reset filter and measurement state
        speedFilter.current.reset();
        startTimeRef.current = 0;
        distanceAccumulatorRef.current = 0;
        
        console.log("✅ Manual zero confirmed com GPS válido, ready to measure");
        console.log("📊 Estado mudando para RUNNING");
        
        triggerHaptics(ImpactStyle.Medium);
        toast({
          title: "Medição iniciada",
          description: "Acelere para registrar 0-100 km/h",
        });
        
        return "RUNNING";
      } else {
        console.log(`⚠️ confirmZero ignorado - estado atual é ${currentState}, esperado WAIT_ZERO`);
        return currentState;
      }
    });
  }, []);

  // Cancel measurement
  const cancel = useCallback(async () => {
    await stopWatching();
    setState("IDLE");
    setCurrentSpeed(0);
    setCurrentSpeedKmh(0);
    setSampleCount(0);
    csvLogger.current.reset();
    triggerHaptics(ImpactStyle.Medium);
    toast({
      title: "Medição cancelada",
      description: "Sistema retornando ao estado inicial",
    });
  }, [stopWatching]);

  // Reset measurement
  const reset = useCallback(async () => {
    await stopWatching();
    setState("IDLE");
    setCurrentSpeed(0);
    setCurrentSpeedKmh(0);
    setSampleCount(0);
    setResult(null);
    csvLogger.current.reset();
    triggerHaptics(ImpactStyle.Light);
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
    gpsValid,
    arm,
    reset,
    cancel,
    confirmZero,
    exportCsv,
  };
}
