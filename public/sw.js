/* WATCH & EARN PRO — service worker
   Cache-first for the app shell, network-only for /api. */
var CACHE = 'watch-earn-pro-v1';
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './locales.js',
  './games.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll fails hard if one file is missing; add individually instead.
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () { /* optional file (e.g. games.js) may 404 during dev */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // API always goes to the network — never cache money/auth data.
  if (url.pathname.indexOf('/api/') !== -1 || e.request.method !== 'GET') return;
  // Ad media: network only (streaming video should not fill the cache).
  if (url.pathname.indexOf('/ads/') !== -1) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.ok && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    })
  );
});
