const CACHE_NAME = "bsn-2a-app-v10";
const BUILD_TAG = "shared-layout-v9";
const INDEX_URL = "./index.html";

self.addEventListener("install", event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch(new Request(INDEX_URL, {
        cache: "no-store",
        credentials: "same-origin"
      }));
      const text = await response.clone().text();

      // Never seed the offline cache with an older/stale build.
      if(!text.includes(BUILD_TAG)){
        throw new Error("Refusing to cache an older app build.");
      }

      await cache.put(INDEX_URL, new Response(text, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      }));

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if(request.method !== "GET") return;

  const url = new URL(request.url);
  if(url.origin !== self.location.origin) return;

  // Navigation: online-first, but only accept the current build.
  if(request.mode === "navigate"){
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);

        try{
          const response = await fetch(request, {
            cache: "no-store",
            credentials: "same-origin"
          });

          if(response.ok){
            const text = await response.clone().text();

            if(text.includes(BUILD_TAG)){
              await cache.put(INDEX_URL, new Response(text, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              }));
              return new Response(text, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
              });
            }

            // GitHub Pages returned an older/stale index.
            const current = await cache.match(INDEX_URL);
            if(current) return current;
          }

          const cached = await cache.match(INDEX_URL);
          if(cached) return cached;

          return response;
        }catch(error){
          const cached = await cache.match(INDEX_URL);
          if(cached) return cached;

          return new Response(
            "BSN 2A Group 4 is offline. Open the app online once to prepare offline mode.",
            {
              status: 503,
              headers: {
                "Content-Type": "text/plain;charset=utf-8"
              }
            }
          );
        }
      })()
    );
    return;
  }

  // Cache same-origin app resources, but do not interfere with Firebase
  // Realtime Database/Storage requests because those are not same-origin.
  event.respondWith(
    caches.match(request).then(cached => {
      if(cached) return cached;

      return fetch(request).then(response => {
        if(response.ok){
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, copy).catch(() => {});
          });
        }
        return response;
      });
    })
  );
});

self.addEventListener("message", event => {
  if(event.data === "SKIP_WAITING"){
    self.skipWaiting();
  }
});
