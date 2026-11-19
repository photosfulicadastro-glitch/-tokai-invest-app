import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApi} from '../server/server.mjs';
import {sqliteStore} from '../server/storage.mjs';
import {signRequest} from '../server/integration.mjs';
const PASSWORD='Senha9!xy',TERMS='signals-copy-risk-v2',admin='a'.repeat(40),SECRET='s'.repeat(40);
async function boot(path,opts={}){
 const storage=sqliteStore(path);
 const server=createApi({storage,viewerToken:admin,ingestToken:'i'.repeat(40),origin:'https://traderoom.tokaiinvest.jp',...opts});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const rq=async(p,token='',body)=>{const r=await fetch(base+p,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let d=null;try{d=await r.json();}catch{}return {s:r.status,d};};
 return {rq,base,close:()=>new Promise(r=>server.close(r))};
}
test('modo Trade Room: plano único, sem Copy, sinais liberados e guia do copy na Monaxa',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tokai-room-')),path=join(dir,'a.sqlite');
 const legacy=await boot(path);
 try{
  assert.equal((await legacy.rq('/v1/config')).d.room,false);
  assert.equal((await legacy.rq('/v1/admin/invites',admin,{username:'antigo.copy',name:'Antigo',plan:'copy'})).s,201);
 }finally{await legacy.close();}
 const t=await boot(path,{copyEngine:false});
 try{
  assert.equal((await t.rq('/v1/config')).d.room,true);
  await new Promise(r=>setTimeout(r,100));
  const old=(await t.rq('/v1/admin/users',admin)).d.users.find(u=>u.username==='antigo.copy');
  assert.equal(old.plan_code,'room');
  const inv=(await t.rq('/v1/admin/invites',admin,{username:'aluno.room',name:'Aluno Room',plan:'copy'})).d;
  const act=await t.rq('/v1/auth/activate','',{invite:inv.invite,password:PASSWORD,terms_accepted:true,terms_version:TERMS});
  assert.equal(act.s,200);assert.equal(act.d.user.plan_code,'room');assert.equal(act.d.user.room,true);
  const tok=act.d.token;
  assert.equal((await t.rq('/v1/me',tok)).d.user.room,true);
  assert.equal((await t.rq('/v1/state',tok)).s,200);
  assert.equal((await t.rq('/v1/copy/me',tok)).s,410);
  assert.equal((await t.rq('/v1/admin/copy/overview',admin)).s,410);
  assert.equal((await t.rq('/v1/copy/activate','',{})).s,410);
  assert.equal((await t.rq('/v1/auth/register','',{name:'Teste',username:'sem.trial',password:PASSWORD,payment_plan:'trial',terms_accepted:true,terms_version:TERMS})).s,400);
  assert.equal((await t.rq('/v1/auth/register','',{name:'Trim',username:'sem.trim',password:PASSWORD,payment_plan:'quarterly',terms_accepted:true,terms_version:TERMS})).s,400);
  const reg=await t.rq('/v1/auth/register','',{name:'Sem MT5',username:'sem.mt5',password:PASSWORD,payment_plan:'annual',terms_accepted:true,terms_version:TERMS});
  assert.equal(reg.s,202);
  assert.deepEqual((await t.rq('/v1/room/copy-guide',tok)).d,{title:'',link:'',text:''});
  assert.equal((await t.rq('/v1/admin/copy-guide',tok,{text:'x'})).s,403);
  assert.equal((await t.rq('/v1/admin/copy-guide',admin,{link:'http://x.com'})).s,400);
  assert.equal((await t.rq('/v1/admin/copy-guide',admin,{title:'Copy na Monaxa',link:'https://monaxa.com/x',text:'Passo 1'})).s,200);
  assert.equal((await t.rq('/v1/room/copy-guide',tok)).d.title,'Copy na Monaxa');
 }finally{await t.close();rmSync(dir,{recursive:true});}
});
test('modo Trade Room: integração grava plano room e ignora MT5',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tokai-room2-')),t=await boot(join(dir,'a.sqlite'),{copyEngine:false,integration:{keyId:'portal-1',secret:SECRET}});
 try{
  const raw=JSON.stringify({email:'a@b.com',name:'Ana',plan:'signals_copy',status:'active',access_until:new Date(Date.now()+864e5*30).toISOString(),mt5_account:'123456',broker_server:'Exness-MT5Real'});
  const path='/v1/integration/users/p1',ts=Math.floor(Date.now()/1000);
  const r=await fetch(t.base+path,{method:'PUT',headers:{'X-Key-Id':'portal-1','X-Timestamp':String(ts),'X-Signature':signRequest(SECRET,{timestamp:ts,method:'PUT',path,body:raw}),'Idempotency-Key':'abcdefgh1','Content-Type':'application/json'},body:raw});
  assert.equal(r.status,200);
  const u=(await t.rq('/v1/admin/users',admin)).d.users.find(x=>x.portal_user_id==='p1');
  assert.equal(u.plan_code,'room');
 }finally{await t.close();rmSync(dir,{recursive:true});}
});
