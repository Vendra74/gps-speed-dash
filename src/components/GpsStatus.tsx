import { Satellite } from "lucide-react";
import { cn } from "@/lib/utils";

interface GpsStatusProps {
  isValid: boolean;
  sampleCount: number;
  quality: "good" | "medium" | "poor";
}

const QUALITY_CONFIG = {
  good: {
    label: "GPS OK",
    color: "text-signal-good",
    bgColor: "bg-signal-good/10",
  },
  medium: {
    label: "GPS OK",
    color: "text-signal-medium",
    bgColor: "bg-signal-medium/10",
  },
  poor: {
    label: "GPS Fraco",
    color: "text-signal-poor",
    bgColor: "bg-signal-poor/10",
  },
};

export function GpsStatus({ isValid, sampleCount, quality }: GpsStatusProps) {
  const config = QUALITY_CONFIG[quality];

  return (
    <div className={cn(
      "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium glass-card",
      isValid && sampleCount > 0 ? config.bgColor : ""
    )}>
      <Satellite className={cn(
        "w-3.5 h-3.5",
        isValid && sampleCount > 0 ? config.color : "text-muted-foreground"
      )} />
      <span className={isValid && sampleCount > 0 ? config.color : "text-muted-foreground"}>
        {isValid && sampleCount > 0 ? config.label : "Aguardando GPS"}
      </span>
      {sampleCount > 0 && (
        <>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{sampleCount}</span>
        </>
      )}
    </div>
  );
}
