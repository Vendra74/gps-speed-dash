import { Signal } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignalQualityProps {
  quality: "good" | "medium" | "poor";
  sampleCount: number;
}

const QUALITY_CONFIG = {
  good: {
    label: "Excelente",
    color: "text-signal-good",
    bars: 3,
  },
  medium: {
    label: "Bom",
    color: "text-signal-medium",
    bars: 2,
  },
  poor: {
    label: "Fraco",
    color: "text-signal-poor",
    bars: 1,
  },
};

export function SignalQuality({ quality, sampleCount }: SignalQualityProps) {
  const config = QUALITY_CONFIG[quality];

  return (
    <div className="flex items-center gap-2 text-sm">
      <Signal className={cn("w-4 h-4", config.color)} />
      <span className={config.color}>{config.label}</span>
      <span className="text-muted-foreground">•</span>
      <span className="text-muted-foreground">{sampleCount} amostras</span>
    </div>
  );
}
