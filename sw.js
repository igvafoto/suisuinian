var CACHE_NAME = "murmur-v1";
var ASSETS = [
  "./", "./index.html", "./manifest.json", "./styles.css", "./app.js",
  "./icon-192.png", "./icon-512.png", "./icon-1024.png", "./apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  e.respondWith(caches.match(e.request).then(function (cached) {
    if (cached) return cached;
    return fetch(e.request).then(function (response) {
      var respClone = response.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, respClone); });
      return response;
    }).catch(function () { return cached; });
  }));
});
