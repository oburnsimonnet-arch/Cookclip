// Service worker minimal : met en cache l'interface (pas l'API) pour un lancement instantané,
// y compris hors connexion (les recettes enregistrées vivent dans le stockage de l'appareil).
const CACHE = "cookclip-v2";
const SHELL = [
  "/",
  "/styles.css",
  "/app.js",
  "/js/ids.js",
  "/js/format.js",
  "/js/sanitize.js",
  "/js/store.js",
  "/js/backup.js",
  "/js/shopping.js",
  "/js/timer.js",
  "/js/cook.js",
  "/js/edit.js",
  "/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (e) => {
  // un fichier manquant ne doit pas empêcher l'installation des autres
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((url) => c.add(url)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  // Réseau d'abord, cache en secours : les mises à jour arrivent dès qu'on est en ligne.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/"))),
  );
});
