const CACHE='malvorlage-v4';
const ASSETS=['./','./index.html','./style.css','./app.js','./core.js','./worker.js','./manifest.webmanifest','./icons/icon.svg','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('malvorlage-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
 if(event.request.mode==='navigate'){
  event.respondWith((async()=>{try{
   const response=await fetch(event.request);if(response.ok){const cache=await caches.open(CACHE);await cache.put('./index.html',response.clone());return response;}
   const cached=await caches.match('./index.html');return cached||response;
  }catch(e){return (await caches.match('./index.html'))||Response.error();}})());
 }else{
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
 }
});
