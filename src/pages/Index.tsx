import { useMeasurement } from "@/hooks/useMeasurement";
import { SafetyWarning } from "@/components/SafetyWarning";
import { StateIndicator } from "@/components/StateIndicator";
import { SpeedDisplay } from "@/components/SpeedDisplay";
import { SignalQuality } from "@/components/SignalQuality";
import { ResultCard } from "@/components/ResultCard";
import { ControlButton } from "@/components/ControlButton";
import { Button } from "@/components/ui/button";
import { Download, Info } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const Index = () => {
  const {
    state,
    currentSpeed,
    currentSpeedKmh,
    sampleCount,
    result,
    signalQuality,
    arm,
    reset,
    cancel,
    confirmZero,
    exportCsv,
  } = useMeasurement();

  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 flex flex-col">
      {/* Header */}
      <header className="text-center mb-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <h1 className="text-4xl md:text-5xl font-bold text-primary">
            0–100 km/h
          </h1>
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
                    <strong>1. ARMAR:</strong> Pressione o botão ARMAR para iniciar o sistema GPS.
                  </p>
                  <p>
                    <strong>2. PARAR:</strong> Aguarde até que o veículo esteja completamente parado
                    (velocidade &lt; 2 km/h por 1 segundo).
                  </p>
                  <p>
                    <strong>3. ACELERAR:</strong> O cronômetro inicia automaticamente quando você
                    sair do zero. Não toque no telefone!
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
        <p className="text-sm text-muted-foreground">Cronometragem GPS de alta precisão</p>
      </header>

      {/* Safety Warning */}
      <div className="mb-6">
        <SafetyWarning />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center space-y-8 max-w-2xl mx-auto w-full">
        {/* State Indicator */}
        <StateIndicator state={state} />

        {/* Speed Display */}
        <div className="w-full">
          <SpeedDisplay speedMps={currentSpeed} speedKmh={currentSpeedKmh} state={state} />
        </div>

        {/* Signal Quality */}
        {(state === "ARMED" || state === "WAIT_ZERO" || state === "RUNNING") && (
          <SignalQuality quality={signalQuality} sampleCount={sampleCount} />
        )}

        {/* Result Card */}
        {result && state === "DONE" && (
          <div className="w-full">
            <ResultCard result={result} />
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
