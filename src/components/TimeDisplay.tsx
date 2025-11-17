import { Timer } from "lucide-react";

interface TimeDisplayProps {
  timeSeconds: number;
  isRunning: boolean;
}

export function TimeDisplay({ timeSeconds, isRunning }: TimeDisplayProps) {
  return (
    <div className="w-full">
      <div className="bg-card border-2 border-border rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Timer className={`w-6 h-6 ${isRunning ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
          <h2 className="text-lg font-semibold text-foreground">Cronômetro</h2>
        </div>
        <div className="text-center">
          <div className={`text-6xl md:text-7xl font-digital font-bold tabular-nums ${
            isRunning ? 'text-primary digital-display-active' : 'text-muted-foreground digital-display'
          }`}>
            {timeSeconds.toFixed(2)}
          </div>
          <div className="text-sm text-muted-foreground mt-2">segundos</div>
        </div>
      </div>
    </div>
  );
}
