// MojoBoost — sw.js — Service Worker

const CACHE = "mojoboost-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./mods.html",
  "./mod-detail.html",
  "./calculator.html",
  "./compatibility.html",
  "./search.html",
  "./settings.html",
  "./about.html",
  "./css/main.css",
  "./css/animations.css",
  "./js/app.js",
  "./js/mods-data.js",
  "./js/recommendation-engine.js",
  "./manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});
