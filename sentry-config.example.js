// BatiTrack — Sentry configuration (optional).
//
// STEP 1: Sign up at https://sentry.io and create a Browser JavaScript project.
// STEP 2: Copy this file to `sentry-config.js`.
// STEP 3: Paste your DSN below. That's it.
//
// If `sentry-config.js` is missing OR the DSN is empty, the app runs without
// error tracking. It will still work; you just won't be notified of client
// errors.
//
// `sentry-config.js` is in .gitignore — never commit your DSN to source control.

window.SENTRY_CONFIG = {
  dsn:              '',            // e.g. 'https://abc123@o45.ingest.sentry.io/4567'
  environment:      'production',  // 'development' | 'staging' | 'production'
  release:          undefined,     // optional version tag, e.g. 'batitrack@0.1.0'
  tracesSampleRate: 0.1            // 10% performance traces — set to 0 to disable
};
