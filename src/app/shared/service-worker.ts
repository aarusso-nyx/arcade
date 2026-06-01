/**
 * Registers the NYX Arcade service worker (cache-first + offline shell).
 *
 * Skips registration on `localhost` so the Angular dev server can hot-reload
 * without a stale cached shell sitting in front of it.
 *
 * `opts.hostname` is a test seam (Chrome's `window.location.hostname` is
 * non-configurable, so direct jasmine spies on it fail). Production callers
 * leave it unset and the runtime `location.hostname` is used.
 */
export function registerServiceWorker(opts: { hostname?: string } = {}): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const host = opts.hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
  if (host === 'localhost' || host === '127.0.0.1') return;
  if (typeof window === 'undefined') return;
  // `once: true` so the listener removes itself after the load event —
  // important so per-spec test runs don't leak listeners across each other.
  window.addEventListener(
    'load',
    () => {
      navigator.serviceWorker
        .register('sw.js')
        .catch((err) => console.error('SW registration failed', err));
    },
    { once: true },
  );
}
