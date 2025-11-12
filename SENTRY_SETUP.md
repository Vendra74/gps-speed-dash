# Sentry Error Monitoring Setup

This app is configured with Sentry for production error monitoring, crash reporting, and performance tracking.

## What's Included

- ✅ **Error Boundary**: Catches React errors and displays user-friendly fallback UI
- ✅ **Automatic Error Reporting**: All unhandled errors are sent to Sentry
- ✅ **Performance Monitoring**: Track app performance and slow operations
- ✅ **Session Replay**: Record user sessions when errors occur (privacy-safe)
- ✅ **Source Maps**: Uploaded automatically for readable stack traces
- ✅ **Development Safety**: Sentry only activates in production builds

## Setup Instructions

### 1. Create a Sentry Account

1. Go to [https://sentry.io](https://sentry.io) and sign up (free tier available)
2. Create a new project and select **React** as the platform
3. Copy your **DSN** (Data Source Name) from the project settings

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and add your Sentry credentials:

```bash
# Required: Your Sentry DSN
VITE_SENTRY_DSN=https://your-dsn@sentry.io/your-project-id

# Optional: For source map uploads (improves error readability)
SENTRY_ORG=your-organization-slug
SENTRY_PROJECT=your-project-name
SENTRY_AUTH_TOKEN=your-auth-token
```

**To get an auth token:**
1. Go to Sentry → Settings → Auth Tokens
2. Create a new token with `project:releases` scope
3. Copy the token to your `.env` file

### 3. Deploy

When you deploy your app with the `VITE_SENTRY_DSN` environment variable set, Sentry will automatically:
- Track errors in production
- Report crashes with stack traces
- Monitor performance issues
- Record session replays for errors

### 4. Test It Works

To verify Sentry is working:

1. Add a test error button in development:
```tsx
<button onClick={() => { throw new Error("Test Sentry") }}>
  Trigger Test Error
</button>
```

2. Build and run in production mode:
```bash
npm run build
npm run preview
```

3. Click the button and check your Sentry dashboard

## Features

### Error Boundary
Wraps your entire app and catches React rendering errors. Shows a friendly error page to users while reporting the issue to Sentry.

### Automatic Tracking
- JavaScript errors
- Unhandled promise rejections
- Console errors (filtered)
- GPS/Capacitor errors
- Network failures

### Privacy & Performance
- Only activates in production (`import.meta.env.PROD`)
- Masks sensitive text in session replays
- Blocks media in session replays
- Ignores browser extension errors
- Samples 10% of sessions (configurable)

### Source Maps
In production builds with proper configuration, Sentry will upload source maps automatically, making error stack traces readable.

## Configuration

All Sentry configuration is in `src/lib/sentry.ts`. You can customize:

- **Sample rates**: Adjust `tracesSampleRate` and `replaysSessionSampleRate`
- **Ignored errors**: Add patterns to `ignoreErrors` array
- **Trace targets**: Update `tracePropagationTargets` with your domains
- **Integrations**: Enable/disable browser tracing, replays, etc.

## Development vs Production

- **Development**: Sentry is completely disabled, all errors appear in console
- **Production**: Sentry captures and reports all errors automatically

## Cost

Sentry offers a generous free tier:
- 5,000 errors per month
- 50 replays per month
- 10,000 performance transactions per month

For higher volumes, see [Sentry pricing](https://sentry.io/pricing/).

## Need Help?

- [Sentry React Documentation](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Sentry Vite Plugin](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/uploading/vite/)
- [Error Monitoring Best Practices](https://docs.sentry.io/product/issues/)
