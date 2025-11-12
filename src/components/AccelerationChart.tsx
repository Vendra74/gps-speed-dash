import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { SpeedPoint } from "@/types/measurement";

interface AccelerationChartProps {
  speedPoints: SpeedPoint[];
  finalTime: number;
}

export function AccelerationChart({ speedPoints, finalTime }: AccelerationChartProps) {
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 text-foreground">Curva de Aceleração</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={speedPoints} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="time" 
            label={{ value: 'Tempo (s)', position: 'insideBottom', offset: -5 }}
            className="text-muted-foreground text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis 
            label={{ value: 'Velocidade (km/h)', angle: -90, position: 'insideLeft' }}
            className="text-muted-foreground text-xs"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            domain={[0, 110]}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(var(--background))', 
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              color: 'hsl(var(--foreground))'
            }}
            formatter={(value: number) => [`${value.toFixed(1)} km/h`, 'Velocidade']}
            labelFormatter={(value: number) => `${value.toFixed(2)}s`}
          />
          <ReferenceLine 
            y={100} 
            stroke="hsl(var(--primary))" 
            strokeDasharray="5 5" 
            label={{ value: '100 km/h', fill: 'hsl(var(--primary))', position: 'right' }}
          />
          <Line 
            type="monotone" 
            dataKey="speed" 
            stroke="hsl(var(--primary))" 
            strokeWidth={3}
            dot={false}
            animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-4 text-sm text-muted-foreground text-center">
        Tempo total: <span className="font-semibold text-foreground">{finalTime.toFixed(2)}s</span>
      </div>
    </Card>
  );
}
