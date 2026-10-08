const CACHE_PREFIX = `ar-move-${new URL("./", self.location.href).pathname}-`;
const CACHE = `${CACHE_PREFIX}v3-2`;
const FILES = ["./", "./dashboard.html", "./styles.css", "./experience.css", "./app.js", "./features.js", "./manifest.webmanifest", "./assets/icon.svg", "./assets/JC.png", "./assets/JCM.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(new URL("./", self.location.href).pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    if (event.request.mode === "navigate") return caches.match("./dashboard.html");
    return Response.error();
  }));
});
