import { MeasurementState } from "@/types/measurement";
import { cn } from "@/lib/utils";

interface SpeedDisplayProps {
  speedMps: number;
  speedKmh: number;
  state: MeasurementState;
}

export function SpeedDisplay({ speedMps, speedKmh, state }: SpeedDisplayProps) {
  const isRunning = state === "RUNNING";

  return (
    <div className={cn("text-center", isRunning && "pulse-racing")}>
      <div className={`text-6xl md:text-8xl font-bold font-digital tracking-tight ${
        isRunning ? 'text-primary digital-display-active' : 'text-primary digital-display'
      }`}>
        {speedKmh.toFixed(1)}
      </div>
      <div className="text-lg text-muted-foreground font-medium mt-2">km/h</div>
      <div className="text-sm text-muted-foreground mt-1 font-digital">
        {speedMps.toFixed(2)} m/s
      </div>
    </div>
  );
}
