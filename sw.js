const CACHE_NAME = "krestik-v11";
const FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles-modes.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/i18n/ru.js",
  "./js/i18n/dmc-names-ru.js",
  "./js/storage.js",
  "./js/worker.js",
  "./js/engine/index.js",
  "./js/engine/dmc.js",
  "./js/engine/color.js",
  "./js/engine/geometry.js",
  "./js/engine/grid.js",
  "./js/engine/sample.js",
  "./js/engine/quantize.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./js/ui/dom.js",
  "./js/ui/projects.js",
  "./js/ui/import.js",
  "./js/ui/crop.js",
  "./js/ui/settings.js",
  "./js/ui/palette.js",
  "./js/ui/inventory.js",
  "./js/ui/stitch.js",
  "./js/ui/export.js",
  "./js/ui/symbols.js",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        FILES.map(async (file) => {
          try {
            const cacheUrl = new URL(file, self.registration.scope);
            const freshUrl = new URL(cacheUrl);
            freshUrl.searchParams.set("__precache", CACHE_NAME);
            const response = await fetch(freshUrl, { cache: "reload" });
            if (response.ok) await cache.put(cacheUrl.href, response);
          } catch {}
        }),
      );
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => (key.startsWith("krestik-") || key.startsWith("point-atelier-")) && key !== CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(event.request);
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return cache.match("./index.html");
      }
    })(),
  );
});
