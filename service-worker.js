// ── Cache name — bump the version string whenever you deploy changes ──
const CACHE_NAME = 'vehreg-v1';

// Files to pre-cache on install (your app shell)
const APP_SHELL = [
  '/vehicle-registration.html',
  '/certificate-template.html',
  '/pdf-template.js',
  '/manifest.json',
  '/icons/icon-32.png',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// CDN assets — cached on first use, not pre-cached (too large to fetch on install)
const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
];

// ── Install: pre-cache the app shell ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── Activate: delete old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim()) // take control of open tabs
  );
});

// ── Fetch: cache-first for app shell, network-first for everything else ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (POST, etc.)
  if (event.request.method !== 'GET') return;

  // Skip browser-extension and non-http requests
  if (!url.protocol.startsWith('http')) return;

  // CDN assets: cache-first (they're versioned and never change)
  if (CDN_HOSTS.some(host => url.hostname.includes(host))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // App shell: cache-first, fall back to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache for next time
      return fetch(event.request)
        .then(response => {
          // Only cache valid responses
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Network failed and not in cache — return offline fallback if navigating
          if (event.request.mode === 'navigate') {
            return caches.match('/vehicle-registration.html');
          }
        });
    })
  );
});

// ── Background sync placeholder (for future use with a backend) ──
// self.addEventListener('sync', event => {
//   if (event.tag === 'sync-registrations') {
//     event.waitUntil(syncPendingRegistrations());
//   }
// });
