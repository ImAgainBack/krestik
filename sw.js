const CACHE_NAME = "krestik-v22";
const FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles-modes.css",
  "./styles-stitch.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/i18n/ru.js",
  "./js/i18n/dmc-names-ru.js",
  "./js/storage.js",
  "./js/worker.js",
  "./js/engine/index.js",
  "./js/engine/dmc.js",
  "./js/engine/gamma.js",
  "./js/engine/palettes.js",
  "./js/engine/blends.js",
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
  "./js/ui/pdf.js",
  "./js/ui/pdf-plan.js",
  "./js/ui/pdf-dialog.js",
  "./js/ui/backup.js",
  "./js/i18n/ru-stitch.js",
  "./js/ui/symbols.js",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Cache.addAll is atomic: one failed essential response rejects installation.
      const requests = FILES.map(file => new Request(new URL(file, self.registration.scope), {cache:'reload'}));
      await cache.addAll(requests);
      // Message contract: {type:'KRESTIK_UPDATE_AVAILABLE', version:CACHE_NAME}.
      // App may show «Доступна новая версия». No forced activation.
      if (self.registration.active) {
        const clients = await self.clients.matchAll({includeUncontrolled:true});
        clients.forEach(client => client.postMessage({type:'KRESTIK_UPDATE_AVAILABLE', version:CACHE_NAME}));
      }
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
        if (event.request.mode === "navigate") return await cache.match("./index.html") || Response.error();
        return Response.error();
      }
    })(),
  );
});

// Optional explicit acceptance, sent only after the app/user chooses a safe moment.
self.addEventListener('message', event => {
  if (event.data?.type === 'KRESTIK_ACTIVATE_UPDATE') self.skipWaiting();
});
