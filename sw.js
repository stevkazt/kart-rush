// Offline cache for Kart Rush. Bump VERSION whenever the game files change.
const VERSION = 'kart-rush-v11';

const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './sound.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Game files: network first (so edits show up), falling back to cache when offline.
// CDN libraries are pinned versions, so serve them cache first.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const isCdn = request.url.startsWith('https://cdn.jsdelivr.net/');

  if (isCdn) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
        return res;
      })),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy));
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true })),
  );
});
