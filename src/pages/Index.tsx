import { useMeasurement } from "@/hooks/useMeasurement";
import { SafetyWarning } from "@/components/SafetyWarning";
import { StateIndicator } from "@/components/StateIndicator";
import { SpeedDisplay } from "@/components/SpeedDisplay";
import { TimeDisplay } from "@/components/TimeDisplay";
import { SignalQuality } from "@/components/SignalQuality";
import { GpsStatus } from "@/components/GpsStatus";
import { ResultCard } from "@/components/ResultCard";
import { AccelerationChart } from "@/components/AccelerationChart";
import { ControlButton } from "@/components/ControlButton";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Download, Info, MapPin } from "lucide-react";
import { useState, useEffect } from "react";
import { Geolocation } from "@capacitor/geolocation";
import { Capacitor } from "@capacitor/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const Index = () => {
  const [isManualMode, setIsManualMode] = useState(false);
  const {
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
  } = useMeasurement(isManualMode);

  const [showInfo, setShowInfo] = useState(false);
  const [locationPermission, setLocationPermission] = useState<"granted" | "denied" | "prompt" | "prompt-with-rationale">("prompt");
  const [elapsedTime, setElapsedTime] = useState(0);

  // Check location permission on mount
  useEffect(() => {
    const checkPermission = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const permission = await Geolocation.checkPermissions();
          setLocationPermission(permission.location);
        } catch (error) {
          console.error("Error checking location permission:", error);
        }
      } else {
        // Browser: check if geolocation is available
        if (navigator.geolocation) {
          setLocationPermission("prompt");
        } else {
          setLocationPermission("denied");
        }
      }
    };
    
    checkPermission();
  }, []);

  // Update elapsed time when running
  useEffect(() => {
    if (state === "RUNNING") {
      const interval = setInterval(() => {
        setElapsedTime((prev) => prev + 0.05);
      }, 50);
      return () => clearInterval(interval);
    } else {
      setElapsedTime(0);
    }
  }, [state]);

  const requestLocationPermission = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const permission = await Geolocation.requestPermissions();
        setLocationPermission(permission.location);
        
        if (permission.location === "granted") {
          toast({
            title: "✅ Permissão concedida",
            description: "O app pode acessar sua localização durante o uso.",
          });
        } else {
          toast({
            title: "⚠️ Permissão negada",
            description: "O app precisa de acesso à localização para funcionar.",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Error requesting location permission:", error);
        toast({
          title: "Erro",
          description: "Não foi possível solicitar permissão de localização.",
          variant: "destructive",
        });
      }
    } else {
      // Browser: trigger geolocation request
      navigator.geolocation.getCurrentPosition(
        () => {
          setLocationPermission("granted");
          toast({
            title: "✅ Permissão concedida",
            description: "O app pode acessar sua localização.",
          });
        },
        (error) => {
          setLocationPermission("denied");
          toast({
            title: "⚠️ Permissão negada",
            description: error.message || "Não foi possível acessar a localização.",
            variant: "destructive",
          });
        },
        { enableHighAccuracy: true }
      );
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 flex flex-col">
      {/* Header */}
      <header className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Logo className="text-4xl md:text-5xl" />
          <Dialog open={showInfo} onOpenChange={setShowInfo}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Info className="w-5 h-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Como usar</DialogTitle>
                <DialogDescription className="space-y-2 text-left">
                  <p>
                    <strong>Modo Disparo:</strong> Escolha entre automático (detecta quando o veículo está parado) ou manual (inicia imediatamente).
                  </p>
                  <p>
                    <strong>1. ARMAR:</strong> Pressione o botão ARMAR para iniciar o sistema GPS.
                  </p>
                  <p>
                    <strong>2. MODO AUTOMÁTICO:</strong> Aguarde até que o veículo esteja completamente parado
                    (velocidade &lt; 2 km/h por 1 segundo).
                  </p>
                  <p>
                    <strong>2. MODO MANUAL:</strong> A medição inicia imediatamente após armar.
                  </p>
                  <p>
                    <strong>3. ACELERAR:</strong> O cronômetro registra automaticamente quando você
                    acelera. Não toque no telefone!
                  </p>
                  <p>
                    <strong>4. FINALIZAR:</strong> A medição para automaticamente ao cruzar 100 km/h.
                    Você receberá feedback visual, sonoro e tátil.
                  </p>
                  <p className="text-safety-yellow font-semibold">
                    ⚠️ Use apenas em locais seguros, privados e legais!
                  </p>
                </DialogDescription>
              </DialogHeader>
            </DialogContent>
        </Dialog>
      </div>

      {/* GPS Status */}
      <div className="flex justify-center mb-6">
        <GpsStatus 
          isValid={gpsValid} 
          sampleCount={sampleCount} 
          quality={signalQuality}
        />
      </div>
        <p className="text-sm text-muted-foreground">
          Cronometragem GPS de alta precisão
        </p>
      </header>

      {/* Location Permission Alert */}
      {(locationPermission === "prompt" || locationPermission === "prompt-with-rationale" || locationPermission === "denied") && (
        <div className="mb-6">
          <Alert className="border-primary/30 glass-card">
            <MapPin className="h-5 w-5 text-primary" />
            <AlertTitle className="text-foreground">Permissão de Localização Necessária</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {locationPermission === "denied" 
                ? "O acesso à localização foi negado. Habilite nas configurações do dispositivo para usar o app."
                : "Este app precisa acessar sua localização durante o uso para medir a velocidade com GPS."}
              {(locationPermission === "prompt" || locationPermission === "prompt-with-rationale") && (
                <Button 
                  onClick={requestLocationPermission}
                  className="mt-3 w-full"
                  size="sm"
                >
                  <MapPin className="w-4 h-4 mr-2" />
                  Permitir Localização
                </Button>
              )}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Safety Warning */}
      <div className="mb-6">
        <SafetyWarning />
      </div>

      {/* Manual/Auto Mode Switch */}
      <div className="mb-6 max-w-2xl mx-auto w-full">
        <div className="flex items-center justify-center gap-3 p-4 rounded-lg glass-card">
          <Label htmlFor="manual-mode" className="text-sm font-medium cursor-pointer">
            Disparo Automático
          </Label>
          <Switch
            id="manual-mode"
            checked={isManualMode}
            onCheckedChange={setIsManualMode}
            disabled={state !== "IDLE"}
          />
          <Label htmlFor="manual-mode" className="text-sm font-medium cursor-pointer">
            Disparo Manual
          </Label>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          {isManualMode 
            ? "Medição inicia imediatamente ao armar" 
            : "Medição inicia após detectar veículo parado"}
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-8 max-w-2xl mx-auto w-full">
        {/* State Indicator */}
        <StateIndicator state={state} />

        {/* Speed Display */}
        <div className="w-full">
          <SpeedDisplay speedMps={currentSpeed} speedKmh={currentSpeedKmh} state={state} />
        </div>

        {/* Time Display - Show when RUNNING or DONE */}
        {(state === "RUNNING" || state === "DONE") && (
          <TimeDisplay 
            timeSeconds={state === "DONE" && result ? result.timeSeconds : elapsedTime} 
            isRunning={state === "RUNNING"}
          />
        )}

        {/* Signal Quality */}
        {(state === "ARMED" || state === "WAIT_ZERO" || state === "RUNNING") && (
          <SignalQuality quality={signalQuality} sampleCount={sampleCount} />
        )}

        {/* Result Card */}
        {result && state === "DONE" && (
          <div className="w-full space-y-4">
            <ResultCard result={result} />
            {result.speedPoints && result.speedPoints.length > 0 && (
              <AccelerationChart 
                speedPoints={result.speedPoints} 
                finalTime={result.timeSeconds}
              />
            )}
          </div>
        )}

        {/* Control Buttons */}
        <div className="w-full space-y-3">
          <ControlButton state={state} onArm={arm} onReset={reset} onCancel={cancel} onConfirmZero={confirmZero} />

          {state === "DONE" && (
            <Button
              onClick={exportCsv}
              variant="outline"
              size="lg"
              className="w-full"
            >
              <Download className="w-5 h-5 mr-2" />
              Exportar CSV
            </Button>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center mt-8 text-xs text-muted-foreground">
        <p>Desenvolvido com Capacitor • GPS de alta frequência</p>
      </footer>
    </div>
  );
};

export default Index;
