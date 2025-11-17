import { MeasurementResult } from "@/types/measurement";
import { mpsToKmh } from "@/utils/interpolation";
import { Card } from "@/components/ui/card";
import { Trophy, Gauge, Route, Target } from "lucide-react";

interface ResultCardProps {
  result: MeasurementResult;
}

export function ResultCard({ result }: ResultCardProps) {
  return (
    <Card className="p-6 glass-card border-primary/30">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-bold">Resultado</h2>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Target className="w-4 h-4" />
            Tempo 0-100
          </div>
          <div className="text-3xl font-bold text-primary">
            {result.timeSeconds.toFixed(2)}s
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Gauge className="w-4 h-4" />
            Velocidade Final
          </div>
          <div className="text-2xl font-bold">
            {mpsToKmh(result.finalSpeed).toFixed(1)} km/h
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Route className="w-4 h-4" />
            Distância
          </div>
          <div className="text-2xl font-bold">
            {result.distanceMeters.toFixed(1)} m
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-sm text-muted-foreground">Amostras</div>
          <div className="text-2xl font-bold">{result.sampleCount}</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <div className="text-xs text-muted-foreground space-y-1">
          <div>Precisão Horizontal: {result.avgHorizontalAccuracy.toFixed(2)} m</div>
          {result.avgSpeedAccuracy > 0 && (
            <div>Precisão Velocidade: {result.avgSpeedAccuracy.toFixed(2)} m/s</div>
          )}
        </div>
      </div>
    </Card>
  );
}
