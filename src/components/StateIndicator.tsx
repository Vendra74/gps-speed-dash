import { MeasurementState } from "@/types/measurement";
import { cn } from "@/lib/utils";

interface StateIndicatorProps {
  state: MeasurementState;
}

const STATE_CONFIG: Record<
  MeasurementState,
  { label: string; color: string; description: string }
> = {
  IDLE: {
    label: "IDLE",
    color: "text-muted-foreground",
    description: "Pressione ARMAR para começar",
  },
  ARMED: {
    label: "ARMADO",
    color: "text-safety-yellow",
    description: "Iniciando GPS...",
  },
  WAIT_ZERO: {
    label: "AGUARDANDO ZERO",
    color: "text-safety-yellow",
    description: "Pare completamente o veículo",
  },
  RUNNING: {
    label: "MEDINDO",
    color: "text-speed-green",
    description: "Acelerando... Mãos no volante!",
  },
  DONE: {
    label: "CONCLUÍDO",
    color: "text-primary",
    description: "Medição finalizada",
  },
};

export function StateIndicator({ state }: StateIndicatorProps) {
  const config = STATE_CONFIG[state];

  return (
    <div className="text-center">
      <div className={cn("text-sm font-mono font-bold tracking-wider mb-1", config.color)}>
        {config.label}
      </div>
      <div className="text-xs text-muted-foreground">{config.description}</div>
    </div>
  );
}
