const CACHE_VERSION = "nursing-duty-hub-v13";
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

    // Cache the current GitHub Pages app shell.
    await cacheRequest(appCache, new URL("./index.html", self.location.href).href);
    await cacheRequest(appCache, new URL("./", self.location.href).href);

    // Warm the Firebase module roots. Any additional module requests are
    // cached by the runtime fetch handler after the newest build is active.
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
      try{
        const response = await fetch(request, {cache:"no-store"});
        if(response && response.ok){
          const cache = await caches.open(APP_CACHE);
          await cache.put(new URL("./index.html", self.location.href).href, response.clone());
          return response;
        }
      }catch(error){}

      const cache = await caches.open(APP_CACHE);
      return (
        await cache.match(new URL("./index.html", self.location.href).href) ||
        await cache.match("./index.html") ||
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
