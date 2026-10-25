const CACHE_NAME = 'cbt-pro-shell-v1';
const SHELL_ASSETS = ['/login', '/manifest.json', '/icon-192.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.url.includes('/api/v1/')) {
    return;
  }
  event.respondWith(
    fetch(req).catch(() => caches.match(req).then((res) => res || caches.match('/login')))
  );
});
