import * as Sentry from "@sentry/react";

/**
 * Initialize Sentry error monitoring
 * 
 * To use Sentry in production:
 * 1. Sign up at https://sentry.io
 * 2. Create a new project for React
 * 3. Copy your DSN from project settings
 * 4. Add VITE_SENTRY_DSN to your environment variables
 * 5. Deploy your app
 * 
 * The integration will only activate in production builds.
 */
export function initSentry() {
  // Only initialize in production with a valid DSN
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  
  if (!import.meta.env.PROD || !sentryDsn) {
    return;
  }

  Sentry.init({
    dsn: sentryDsn,
    
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for tracing.
    // Reduce this value in production to avoid high costs
    tracesSampleRate: 0.1,
    
    // Set `tracePropagationTargets` to control which URLs distributed tracing should be enabled
    tracePropagationTargets: ["localhost", /^https:\/\/yourapp\.com/],
    
    // Capture Replay for 10% of all sessions,
    // plus 100% of sessions with an error
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    
    // Filter out non-error console logs from being sent to Sentry
    beforeSend(event, hint) {
      // Don't send events from development
      if (import.meta.env.DEV) {
        return null;
      }
      return event;
    },
    
    // Set environment
    environment: import.meta.env.MODE,
    
    // Ignore common browser errors that we can't fix
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      // Random plugins/extensions
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      // Network errors
      'Network request failed',
      'NetworkError',
      // Capacitor specific (some are expected)
      'capacitor://localhost',
    ],
  });
}
