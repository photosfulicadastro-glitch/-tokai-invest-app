import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApi} from '../server/server.mjs';
import {sqliteStore} from '../server/storage.mjs';
const TERMS='signals-copy-risk-v2',PASSWORD='Senha9!xy';
async function setup(){
 const dir=mkdtempSync(join(tmpdir(),'tokai-audit-')),storage=sqliteStore(join(dir,'a.sqlite')),admin='a'.repeat(40),ingest='i'.repeat(40);
 const server=createApi({storage,viewerToken:admin,ingestToken:ingest,origin:'https://sinais.tokaiinvest.jp'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const rq=async(path,token='',body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const ct=r.headers.get('content-type')||'';return {s:r.status,d:ct.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};};
 const member=async(username,plan,account)=>{
  const inv=(await rq('/v1/admin/invites',admin,{username,name:username,plan})).d;
  const act=await rq('/v1/auth/activate','',{invite:inv.invite,password:PASSWORD,terms_accepted:true,terms_version:TERMS});
  const user=await storage.auth.find(username);let agent=null,created=null;
  if(account){created=await rq('/v1/admin/copy/agents',admin,{user_id:user.id,expected_account:account,broker_server:'Exness-MT5Trial3',daily_loss_percent:10});agent=created.d.agent;}
  return {token:act.d.token,user,agent,created};
 };
 const close=async()=>{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true});};
 return {rq,admin,ingest,member,close};
}
const licenseFrom=zip=>zip.toString('latin1').match(/License=([A-Za-z0-9_-]{43})/)[1];

test('aluno bloqueado perde o Copy no EA e recupera ao liberar',async()=>{
 const {rq,admin,ingest,member,close}=await setup();
 try{
  await rq('/v1/snapshot',ingest,{source:'principal',observed_at:Math.floor(Date.now()/1000),symbol:'XAUUSD',currency:'USD',bid:1,ask:1,positions:[],deals:[]});
  await rq('/v1/admin/copy/settings',admin,{execution_mode:'both',max_daily_loss_percent:10});
  const a=await member('aluno.a','copy','11111111');
  const zip=await rq('/v1/copy/installer',a.token,{});assert.equal(zip.s,200);
  const body={license:licenseFrom(zip.d),account:'11111111',server:'Exness-MT5Trial3',fingerprint:'fp-AAAAAAAAAAAAAAAA'};
  assert.equal((await rq('/v1/copy/activate','',body)).s,200);
  assert.equal((await rq('/v1/copy/plan','',{...body,equity:1000})).s,200);
  await rq('/v1/admin/access',admin,{id:a.user.id,action:'block'});
  assert.equal((await rq('/v1/copy/plan','',{...body,equity:1000})).s,403);
  assert.equal((await rq('/v1/copy/report','',{...body,equity:1000,event_type:'status',message:'x'})).s,403);
  await rq('/v1/admin/access',admin,{id:a.user.id,action:'enable'});
  assert.equal((await rq('/v1/copy/plan','',{...body,equity:1000})).s,200);
 }finally{await close();}
});

test('plano Copy não acessa /v1/state; Sinais e Sinais+Copy acessam',async()=>{
 const {rq,member,close}=await setup();
 try{
  const copy=await member('so.copy','copy','22222222'),sig=await member('so.sinais','signals'),both=await member('ambos','signals_copy','33333333');
  assert.equal((await rq('/v1/state',copy.token)).s,403);
  assert.equal((await rq('/v1/state',sig.token)).s,200);
  assert.equal((await rq('/v1/state',both.token)).s,200);
 }finally{await close();}
});

test('a mesma conta MT5 não pode ser vinculada a dois alunos',async()=>{
 const {member,close}=await setup();
 try{
  const a=await member('aluno.a','copy','44444444');assert.equal(a.created.s,201);
  const b=await member('aluno.b','copy','44444444');assert.equal(b.created.s,409);
 }finally{await close();}
});
