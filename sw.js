'use strict';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// No response caching: credentials, invitations and market data stay out of caches.
self.addEventListener('push',event=>{
 let payload={title:'TOKAI INVEST',body:'Há uma atualização nos sinais.'};
 try{if(event.data)payload=event.data.json();}catch{}
 event.waitUntil(self.registration.showNotification(payload.title||'TOKAI INVEST',{
  body:payload.body||'Abra o aplicativo para acompanhar.',tag:payload.tag||'tokai',
  icon:new URL('./icons/icon-192.png',self.registration.scope).href,
  data:{url:self.registration.scope}
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const url=self.registration.scope;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows)if(client.url.startsWith(url)){await client.focus();return;}
  await self.clients.openWindow(url);
 })());
});
