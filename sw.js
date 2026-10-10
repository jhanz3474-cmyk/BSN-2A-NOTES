const CACHE_VERSION = "nursing-duty-hub-v16-ai-cloudflare";
const APP_CACHE = CACHE_VERSION + "-app";
const RUNTIME_CACHE = CACHE_VERSION + "-runtime";

const FIREBASE_MODULES = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js"
];

async function cacheRequest(cache, url){
  try{
    const response = await fetch(url, {cache:"no-store"});
    if(response && (response.ok || response.type === "opaque")){
      await cache.put(url, response.clone());
    }
  }catch(error){
    console.warn("Offline cache warm-up skipped:", url, error);
  }
}

self.addEventListener("install", event=>{
  event.waitUntil((async()=>{
    const appCache = await caches.open(APP_CACHE);
    const bust = "offline_build=" + encodeURIComponent(CACHE_VERSION);

    // Cache-bust the GitHub Pages shell fetch so a stale CDN/browser response
    // cannot become the new offline version.
    const indexUrl = new URL("./index.html", self.location.href);
    indexUrl.search = bust;

    const rootUrl = new URL("./", self.location.href);
    rootUrl.search = bust;

    await cacheRequest(appCache, indexUrl.href);
    await cacheRequest(appCache, rootUrl.href);

    // Also keep canonical keys for deterministic offline navigation.
    const cachedIndex = await appCache.match(indexUrl.href);
    if(cachedIndex){
      await appCache.put(new URL("./index.html", self.location.href).href, cachedIndex.clone());
      await appCache.put(new URL("./", self.location.href).href, cachedIndex.clone());
    }

    // Warm the Firebase module roots. Additional successful module requests
    // are cached by the runtime fetch handler after activation.
    for(const url of FIREBASE_MODULES){
      await cacheRequest(appCache, url);
    }

    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event=>{
  event.waitUntil((async()=>{
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key=>key !== APP_CACHE && key !== RUNTIME_CACHE)
        .map(key=>caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event=>{
  const request = event.request;

  // Navigation: always prefer the newest online page, then fall back to
  // the versioned offline app shell after a restart with no connection.
  if(request.mode === "navigate"){
    event.respondWith((async()=>{
      const cache = await caches.open(APP_CACHE);
      const shellUrl = new URL("./index.html", self.location.href).href;

      // Prefer the network while online, but update the exact shell used for
      // future offline restarts. No browser HTTP-cache response is accepted.
      try{
        const response = await fetch(request, {cache:"no-store"});
        if(response && response.ok){
          await cache.put(shellUrl, response.clone());
          await cache.put(new URL("./", self.location.href).href, response.clone());
          return response;
        }
      }catch(error){}

      // Offline restart: serve only our versioned shell, never an arbitrary
      // browser cache entry from an older GitHub Pages build.
      return (
        await cache.match(shellUrl) ||
        await cache.match(new URL("./", self.location.href).href) ||
        Response.error()
      );
    })());
    return;
  }

  // Cache Firebase modules and same-origin app resources after they are
  // successfully fetched. This lets the exact current build boot offline.
  event.respondWith((async()=>{
    try{
      const response = await fetch(request);

      if(response && (response.ok || response.type === "opaque")){
        const url = new URL(request.url);
        const shouldCache =
          url.origin === self.location.origin ||
          url.hostname === "www.gstatic.com" ||
          FIREBASE_MODULES.some(item=>item === request.url);

        if(shouldCache){
          const cache = await caches.open(RUNTIME_CACHE);
          await cache.put(request, response.clone());
        }
      }

      return response;
    }catch(error){
      const runtime = await caches.open(RUNTIME_CACHE);
      const app = await caches.open(APP_CACHE);
      const cached =
        await runtime.match(request) ||
        await app.match(request);

      if(cached) return cached;
      throw error;
    }
  })());
});
