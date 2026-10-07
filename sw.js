/* Legacy service worker kept only to retire older cached builds safely. */
self.addEventListener("install",event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.all(keys.map(key=>caches.delete(key)));
    }catch(error){
      console.warn("Could not clear legacy caches:",error);
    }
    try{
      const registrations=await self.registration.unregister();
      if(!registrations) console.warn("Legacy service worker could not unregister itself.");
    }catch(error){
      console.warn("Could not unregister legacy service worker:",error);
    }
    try{
      const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
      clients.forEach(client=>{
        try{ client.navigate(client.url); }catch(_){}
      });
    }catch(error){}
  })());
});

self.addEventListener("fetch",event=>{
  // Pass every request directly through; no caching.
  event.respondWith(fetch(event.request));
});
