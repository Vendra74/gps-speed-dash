import * as Sentry from "@sentry/react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";

/**
 * Error Boundary component that catches React errors and reports them to Sentry
 */
export const ErrorBoundary = Sentry.withErrorBoundary(
  ({ children }: { children: React.ReactNode }) => children,
  {
    fallback: ({ error, resetError }) => {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : "";
      
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="max-w-md text-center">
            <div className="mb-4 flex justify-center">
              <AlertTriangle className="h-16 w-16 text-destructive" />
            </div>
            <h1 className="mb-2 text-2xl font-bold">Algo deu errado</h1>
            <p className="mb-6 text-muted-foreground">
              O aplicativo encontrou um erro inesperado. Nossa equipe foi notificada.
            </p>
            {import.meta.env.DEV && (
              <div className="mb-6 rounded-lg bg-muted p-4 text-left">
                <p className="mb-2 font-mono text-sm text-destructive">
                  {errorMessage}
                </p>
                <pre className="overflow-x-auto text-xs text-muted-foreground">
                  {errorStack}
                </pre>
              </div>
            )}
            <div className="space-x-2">
              <Button onClick={resetError}>Tentar novamente</Button>
              <Button variant="outline" onClick={() => window.location.href = "/"}>
                Ir para início
              </Button>
            </div>
          </div>
        </div>
      );
    },
    showDialog: false,
  }
);
