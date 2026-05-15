// BatiTrack — Sentry initialisation (optional).
//
// Initialises Sentry IF AND ONLY IF:
//   1. The Sentry SDK is present on window (CDN bundle was loaded), AND
//   2. window.SENTRY_CONFIG.dsn is a non-empty string.
//
// Otherwise installs a no-op `window.Sentry` so the rest of the app can call
// `window.Sentry?.captureException(e)` without checking first.
//
// Recommended <script> order in index.html (BEFORE any app scripts):
//   <script src="https://browser.sentry-cdn.com/7.99.0/bundle.min.js"></script>
//   <script src="sentry-config.js" onerror="this.remove()"></script>
//   <script src="sentry-init.js"></script>

(function () {
  'use strict';

  const cfg = window.SENTRY_CONFIG;
  const sdkAvailable =
    typeof window.Sentry !== 'undefined' &&
    typeof window.Sentry.init === 'function';

  // If there's no DSN or no SDK, install a no-op shim and return.
  if (!cfg || !cfg.dsn || !sdkAvailable) {
    if (!window.Sentry || typeof window.Sentry.captureException !== 'function') {
      window.Sentry = {
        captureException: function () {},
        captureMessage:   function () {},
        setUser:          function () {},
        setTag:           function () {}
      };
    }
    return;
  }

  try {
    window.Sentry.init({
      dsn:              cfg.dsn,
      environment:      cfg.environment || 'production',
      release:          cfg.release,
      tracesSampleRate: typeof cfg.tracesSampleRate === 'number' ? cfg.tracesSampleRate : 0.1,
      // Strip emails out of breadcrumbs as a light privacy guard.
      beforeSend: function (event) {
        try {
          if (event && event.breadcrumbs && event.breadcrumbs.length) {
            event.breadcrumbs.forEach(function (b) {
              if (b && typeof b.message === 'string') {
                b.message = b.message.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
              }
            });
          }
        } catch (e) { /* never break a report */ }
        return event;
      }
    });
  } catch (e) {
    console.warn('Sentry init failed', e);
  }
})();
