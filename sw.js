/* TravelBook service worker
   Goal: the app must open and be fully usable with no signal - which is
   exactly the situation in the Tatras or while crossing the border.

   Strategy:
   - App shell (HTML): network-first, falling back to cache. Online you
     always get the newest version straight after a push; offline you get
     the last one that loaded.
   - Static assets (icons, fonts): cache-first, they never change.
   - Live data APIs (rates, weather, places, sync): not cached here. The
     app already keeps its own copies in localStorage and handles a
     failed request gracefully, so a stale cached response would be
     worse than a clean failure.

   Bump CACHE_VERSION to force every device to refresh the cache. */

const CACHE_VERSION = "travelbook-v1";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
];

// hosts whose responses must always come from the network
const LIVE_HOSTS = [
  "script.google.com",
  "script.googleusercontent.com",
  "open.er-api.com",
  "api.frankfurter.dev",
  "api.open-meteo.com",
  "api.bigdatacloud.net",
  "overpass-api.de",
  "overpass.kumi.systems",
  "overpass.private.coffee",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // addAll fails the whole install if any single file 404s, so add
      // them individually and tolerate misses
      .then(cache => Promise.allSettled(SHELL.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (!url.protocol.startsWith("http")) return;

  // never serve live data from cache
  if (LIVE_HOSTS.some(h => url.hostname.endsWith(h))) return;

  const isShell = req.mode === "navigate"
    || (url.origin === self.location.origin && url.pathname.endsWith(".html"));

  if (isShell) {
    // network-first: newest version when online, cached copy when not
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then(hit => hit || caches.match("./index.html"))
        )
    );
    return;
  }

  // everything else (icons, fonts): cache-first, fill the cache on miss
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});

// lets the page trigger an immediate update instead of waiting for a reload
self.addEventListener("message", event => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
