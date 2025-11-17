import { AlertTriangle } from "lucide-react";

export function SafetyWarning() {
  return (
    <div className="glass-card border-safety-yellow/30 rounded-lg p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-safety-yellow flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <p className="font-semibold text-safety-yellow mb-1">
          AVISO DE SEGURANÇA
        </p>
        <p className="text-foreground/90">
          Não use este aplicativo enquanto dirige. Execute medições apenas em
          locais seguros, privados e legais. Respeite sempre as leis de trânsito.
        </p>
      </div>
    </div>
  );
}
