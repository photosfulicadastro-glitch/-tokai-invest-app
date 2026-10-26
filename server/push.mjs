import webpush from 'web-push';
import {HttpError,readJson} from './auth.mjs';
export function validateSubscription(s){
 let u;try{u=new URL(s?.endpoint);}catch{throw new HttpError(400,'Inscrição inválida.');}
 // Only actual browser push services. Never fetch arbitrary user-controlled URLs.
 const host=u.hostname;
 if(u.protocol!=='https:'||u.port||u.username||u.password||s.endpoint.length>2048||!(host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.apple.com')||host==='web.push.apple.com'))throw new HttpError(400,'Serviço de notificações não suportado.');
 if(!s.keys||!/^[-_A-Za-z0-9]{87}$/.test(s.keys.p256dh)||!/^[-_A-Za-z0-9]{22}$/.test(s.keys.auth))throw new HttpError(400,'Chaves de inscrição inválidas.');
 return {endpoint:s.endpoint,keys:{p256dh:s.keys.p256dh,auth:s.keys.auth}};
}
export async function createPush(repo,{now=()=>Date.now(),transport=webpush.sendNotification.bind(webpush)}={}){
 const keys=await repo.config(webpush.generateVAPIDKeys());
 const options={TTL:120,urgency:'high',timeout:5000,vapidDetails:{subject:'https://photosfulicadastro-glitch.github.io/-tokai-invest-app/',publicKey:keys.publicKey,privateKey:keys.privateKey}};
 let working=false;const tests=new Map();
 async function drain(){if(working)return;working=true;try{
  for(const row of await repo.pending(now())){
   if(!await repo.authorized(row.subscription_id)){await repo.done(row.id);continue;}
   try{await transport(JSON.parse(row.subscription),row.body,{...options,TTL:Math.max(0,Math.floor((Number(row.expires)-now())/1000))});await repo.done(row.id);}
   catch(e){if([404,410].includes(e.statusCode))await repo.remove(row.subscription_id);else await repo.retry(row.id,now());}
  }
 }finally{working=false;}}
 return {drain,async route(req,send,user){
  if(!req.url.startsWith('/v1/push/'))return false;
  if(req.url==='/v1/push/key'&&req.method==='GET'){send(200,{publicKey:keys.publicKey});return true;}
  if(req.method!=='POST')throw new HttpError(404,'Rota não encontrada.');
  const b=await readJson(req);
  if(req.url==='/v1/push/subscribe'){const sub=validateSubscription(b.subscription);await repo.subscribe(user,sub,now());send(200,{ok:true});return true;}
  if(req.url==='/v1/push/unsubscribe'){if(typeof b.endpoint!=='string')throw new HttpError(400,'Inscrição inválida.');await repo.unsubscribe(user,b.endpoint);send(200,{ok:true});return true;}
  if(req.url==='/v1/push/test'){
   const sub=await repo.own(user,b.endpoint||'');if(!sub||!await repo.authorized(sub.id))throw new HttpError(400,'Ative as notificações primeiro.');
   for(const [k,t] of tests)if(t<now()-60000)tests.delete(k);
   if(tests.has(sub.id))throw new HttpError(429,'Aguarde um minuto antes de testar novamente.');tests.set(sub.id,now());
   try{await transport(JSON.parse(sub.body),JSON.stringify({title:'TOKAI INVEST · Teste',body:'Notificações ativadas neste aparelho.',tag:'tokai-test'}),options);}catch(e){if([404,410].includes(e.statusCode))await repo.remove(sub.id);throw new HttpError(503,'Não foi possível entregar o teste. Ative novamente e tente mais tarde.');}
   send(200,{ok:true});return true;
  }
  throw new HttpError(404,'Rota não encontrada.');
 }};
}
