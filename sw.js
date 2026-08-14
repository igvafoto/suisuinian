var CACHE_NAME = "murmur-v3";
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

// 联网优先：每次打开都尽量拉服务器上的最新文件，离线才用缓存
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(function (response) {
        if (response && response.status === 200 && response.type === "basic") {
          var respClone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, respClone); });
        }
        return response;
      })
      .catch(function () {
        return caches.match(e.request).then(function (cached) {
          return cached || caches.match("./");
        });
      })
  );
});
