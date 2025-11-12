import { Button } from "@/components/ui/button";
import { MeasurementState } from "@/types/measurement";
import { cn } from "@/lib/utils";
import { Play, RotateCcw } from "lucide-react";

interface ControlButtonProps {
  state: MeasurementState;
  onArm: () => void;
  onReset: () => void;
}

export function ControlButton({ state, onArm, onReset }: ControlButtonProps) {
  if (state === "IDLE") {
    return (
      <Button
        onClick={onArm}
        size="lg"
        className="w-full h-20 text-2xl font-bold glow-racing"
      >
        <Play className="w-8 h-8 mr-2" />
        ARMAR
      </Button>
    );
  }

  if (state === "DONE") {
    return (
      <Button
        onClick={onReset}
        size="lg"
        variant="secondary"
        className="w-full h-16 text-xl font-bold"
      >
        <RotateCcw className="w-6 h-6 mr-2" />
        NOVA MEDIÇÃO
      </Button>
    );
  }

  return (
    <div className={cn(
      "w-full h-20 flex items-center justify-center text-2xl font-bold rounded-lg border-2 border-dashed",
      state === "RUNNING" ? "border-speed-green/50 text-speed-green" : "border-safety-yellow/50 text-safety-yellow"
    )}>
      {state === "RUNNING" ? "MEDINDO..." : "PREPARANDO..."}
    </div>
  );
}
