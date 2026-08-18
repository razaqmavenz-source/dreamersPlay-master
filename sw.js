const CACHE_NAME = 'dreamersplay-shell-v1';
const APP_SHELL = [
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
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

// Network-first for the app shell (so you always get the latest dashboard when online),
// falling back to cache when offline. Everything else (Firebase, fonts, Chart.js) just
// passes through to the network as normal — this worker only guarantees the shell loads.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isShellRequest = APP_SHELL.some((path) => new URL(path, self.location.href).href === req.url);

  if (isShellRequest) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) =>
            cached || caches.match('./index.html')
          )
        )
    );
  }
});