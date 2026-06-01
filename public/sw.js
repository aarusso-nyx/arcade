/* NYX Arcade — minimal vanilla service worker.
 * Cache-first for static assets and Termo word lists, network-first for HTML.
 * Bump CACHE on every deploy that ships new assets.
 */
const CACHE = 'nyx-v1';

const PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'favicon.ico',
  'favicon-16.png',
  'favicon-32.png',
  'apple-touch-icon.png',
  'nyx-logo-512.png',
  'nyx-logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function cacheFirst(request) {
  return caches.open(CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const networked = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || networked;
    })
  );
}

function networkFirst(request) {
  return caches.open(CACHE).then((cache) =>
    fetch(request)
      .then((response) => {
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      })
      .catch(() => cache.match(request).then((cached) => cached || cache.match('index.html')))
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/assets/termo/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (['script', 'style', 'image', 'font'].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
    return;
  }
});
