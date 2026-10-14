/* MyDay service worker. vite.config.js builds dist/sw.js from this file, defining
   VERSION (a hash of the build) and SHELL (every file in the build) above it.

   - The app shell is cached on install, so every screen opens offline.
   - A new version installs in the background and waits; the page shows
     "A new version of MyDay is ready" and only swaps when Amin taps Refresh. */
const CACHE = "myday-shell-" + VERSION;
const FONTS = "myday-fonts";

self.addEventListener("install", e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u, {cache:"reload"})))));
});

self.addEventListener("message", e=>{
  if (e.data && e.data.type==="SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", e=>{
  e.waitUntil(caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k.startsWith("myday-shell-") && k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim()));
});

self.addEventListener("fetch", e=>{
  const req = e.request, url = new URL(req.url);
  if (req.method!=="GET") return;
  if (url.origin===location.origin){
    if (url.pathname.startsWith("/api/")) return; // API calls always go to the network
    if (req.mode==="navigate"){
      // the app itself opens from cache; other pages (e.g. /privacy) try the network first
      e.respondWith(url.pathname==="/"
        ? caches.match("/", {cacheName:CACHE}).then(r=>r || fetch(req))
        : fetch(req).catch(()=>caches.match("/", {cacheName:CACHE})));
      return;
    }
    e.respondWith(caches.match(req, {cacheName:CACHE}).then(r=>r || fetch(req)));
    return;
  }
  if (url.hostname==="fonts.googleapis.com" || url.hostname==="fonts.gstatic.com"){
    e.respondWith(fromCacheThenRefresh(e, FONTS));
  }
});

/* Answers from cache when it can, and refreshes the cached copy in the background. */
async function fromCacheThenRefresh(e, name){
  const cache = await caches.open(name), hit = await cache.match(e.request);
  const net = fetch(e.request).then(r=>{ if (r.ok) cache.put(e.request, r.clone()); return r; });
  if (!hit) return net;
  e.waitUntil(net.catch(()=>{}));
  return hit;
}
