import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApi} from '../server/server.mjs';
import {sqliteStore} from '../server/storage.mjs';
import {signRequest} from '../server/integration.mjs';
const SECRET='s'.repeat(40),KEY='portal-1',admin='a'.repeat(40);
async function boot(integration){
 const dir=mkdtempSync(join(tmpdir(),'tokai-int-')),storage=sqliteStore(join(dir,'a.sqlite'));
 let clock=Date.now();
 const server=createApi({storage,viewerToken:admin,ingestToken:'i'.repeat(40),origin:'https://sinais.tokaiinvest.jp',now:()=>clock,integration});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const call=async(method,path,body,{key='idem-'+Math.random().toString(36).slice(2,12),ts=Math.floor(clock/1000),secret=SECRET,sig,keyId=KEY}={})=>{
  const raw=body===undefined?'':JSON.stringify(body);
  const headers={'X-Key-Id':keyId,'X-Timestamp':String(ts),'X-Signature':sig??signRequest(secret,{timestamp:ts,method,path,body:raw}),'Content-Type':'application/json'};
  if(method!=='GET')headers['Idempotency-Key']=key;
  const r=await fetch(base+path,{method,headers,body:raw||undefined});return {s:r.status,d:await r.json()};
 };
 const rq=async(path,token,body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {s:r.status,d:await r.json()};};
 return {call,rq,base,tick:ms=>{clock+=ms;},close:async()=>{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true});}};
}
const until=()=>new Date(Date.now()+30*864e5).toISOString();
const body=(o={})=>({email:'Maria@Example.com',name:'Maria Silva',plan:'signals',status:'active',access_until:until(),is_tokai_student:true,billing_state:'trialing',...o});
test('sem segredo configurado a API de integração não existe',async()=>{
 const t=await boot({});
 try{const r=await t.call('GET','/v1/integration/users');assert.equal(r.s,401);}finally{await t.close();}
});
test('assinatura HMAC: inválida, antiga e chave errada são recusadas',async()=>{
 const t=await boot({keyId:KEY,secret:SECRET});
 try{
  assert.equal((await t.call('PUT','/v1/integration/users/p1',body(),{secret:'x'.repeat(40)})).s,401);
  assert.equal((await t.call('PUT','/v1/integration/users/p1',body(),{ts:Math.floor(Date.now()/1000)-1000})).s,401);
  assert.equal((await t.call('PUT','/v1/integration/users/p1',body(),{keyId:'outra'})).s,401);
  assert.equal((await t.call('PUT','/v1/integration/users/p1',body())).s,200);
 }finally{await t.close();}
});
test('upsert cria aluno, é idempotente e mostra selo nos Acessos',async()=>{
 const t=await boot({keyId:KEY,secret:SECRET});
 try{
  const bb=body(),a=await t.call('PUT','/v1/integration/users/p1',bb,{key:'same-key-1'});
  assert.equal(a.s,200);assert.equal(a.d.created,true);
  const again=await t.call('PUT','/v1/integration/users/p1',bb,{key:'same-key-1'});assert.deepEqual(again.d,a.d);
  const b=await t.call('PUT','/v1/integration/users/p1',body({billing_state:'active'}));assert.equal(b.d.created,false);assert.equal(b.d.user_id,a.d.user_id);
  assert.equal((await t.call('PUT','/v1/integration/users/p2',body({email:'x',name:'A'}))).s,422);
  assert.equal((await t.call('PUT','/v1/integration/users/p2',body({plan:'vip'}))).s,422);
  assert.equal((await t.call('PUT','/v1/integration/users/p2',body({access_until:null}))).s,422);
  const users=(await t.rq('/v1/admin/users',admin)).d.users,u=users.find(x=>x.id===a.d.user_id);
  assert.equal(!!u.is_tokai_student,true);assert.equal(u.billing_state,'active');assert.equal(u.plan_code,'signals');assert.equal(u.membership_status,'active');
  const d=await t.call('GET','/v1/integration/users/p1');assert.equal(d.d.is_tokai_student,true);assert.equal(d.d.plan,'signals');
  const list=await t.call('GET','/v1/integration/users?updated_since=0');assert.equal(list.d.users.length,1);
 }finally{await t.close();}
});
test('SSO: ticket de uso único entra sem senha; sem acesso ativo é recusado',async()=>{
 const t=await boot({keyId:KEY,secret:SECRET,appUrl:'https://sinais.tokaiinvest.jp'});
 try{
  assert.equal((await t.call('POST','/v1/integration/users/nao/sso',{})).s,404);
  await t.call('PUT','/v1/integration/users/p1',body());
  const s=await t.call('POST','/v1/integration/users/p1/sso',{});assert.equal(s.s,200);
  const ticket=/#sso=([A-Za-z0-9_-]{43})$/.exec(s.d.url)[1];
  const ex=await t.rq('/v1/auth/sso','',{ticket});assert.equal(ex.s,200);assert.equal(ex.d.user.plan_code,'signals');
  assert.equal((await t.rq('/v1/me',ex.d.token)).s,200);
  assert.equal((await t.rq('/v1/auth/sso','',{ticket})).s,401);
  const s2=await t.call('POST','/v1/integration/users/p1/sso',{});
  t.tick(61000);
  assert.equal((await t.rq('/v1/auth/sso','',{ticket:/#sso=(.+)$/.exec(s2.d.url)[1]})).s,401);
  await t.call('PUT','/v1/integration/users/p1',body({status:'paused'}));
  assert.equal((await t.rq('/v1/me',ex.d.token)).s,401);
  assert.equal((await t.call('POST','/v1/integration/users/p1/sso',{})).s,409);
 }finally{await t.close();}
});
test('renovação só estende a validade e não derruba a sessão',async()=>{
 const t=await boot({keyId:KEY,secret:SECRET});
 try{
  await t.call('PUT','/v1/integration/users/p1',body());
  const ticket=/#sso=(.+)$/.exec((await t.call('POST','/v1/integration/users/p1/sso',{})).d.url)[1];
  const tok=(await t.rq('/v1/auth/sso','',{ticket})).d.token;
  await t.call('PUT','/v1/integration/users/p1',body({access_until:new Date(Date.now()+60*864e5).toISOString(),billing_state:'active'}));
  assert.equal((await t.rq('/v1/me',tok)).s,200);
 }finally{await t.close();}
});
test('plano Copy cria agente e recusa conta MT5 já usada por outro aluno',async()=>{
 const t=await boot({keyId:KEY,secret:SECRET});
 try{
  const c=body({plan:'copy',mt5_account:'123456',broker_server:'Exness-MT5Real'});
  assert.equal((await t.call('PUT','/v1/integration/users/p1',c)).s,200);
  assert.equal((await t.call('PUT','/v1/integration/users/p1',c)).s,200);
  assert.equal((await t.call('GET','/v1/integration/users/p1')).d.copy.mt5_account,'123456');
  assert.equal((await t.call('PUT','/v1/integration/users/p2',{...c,email:'b@x.com',name:'B'})).s,409);
 }finally{await t.close();}
});
