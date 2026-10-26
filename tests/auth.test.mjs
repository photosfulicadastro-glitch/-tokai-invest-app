import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApi} from '../server/server.mjs';
import {sqliteStore} from '../server/storage.mjs';

test('convite individual, privilégios, sessão persistente, revogação e recuperação',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tokai-auth-'));const path=join(dir,'auth.sqlite');
 let now=Date.now(),server,base,storage;const admin='a'.repeat(40),ingest='i'.repeat(40),password='Senha de teste 123!';
 async function start(){storage=sqliteStore(path);server=createApi({storage,ingestToken:ingest,viewerToken:admin,now:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;}
 async function stop(){await new Promise(r=>server.close(r));}
 async function req(path,token='',body){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 await start();
 try{
  assert.equal((await req('/v1/admin/users')).status,403);
  assert.equal((await req('/v1/admin/users',ingest)).status,403);
  assert.equal((await req('/v1/state')).status,401);
  assert.equal((await req('/v1/me',admin)).data.user.role,'admin');
  const invite=await req('/v1/admin/invites',admin,{username:'Maria.Silva',name:'Maria'});
  assert.equal(invite.status,201);assert.equal(invite.data.username,'maria.silva');
  assert.equal((await req('/v1/admin/invites',admin,{username:'maria.silva',name:'Outra'})).status,409);
  assert.equal((await req('/v1/auth/activate','',{invite:invite.data.invite,password:'short'})).status,400);
  const active=await req('/v1/auth/activate','',{invite:invite.data.invite,password});
  assert.equal(active.status,200);assert.equal(active.data.user.role,'reader');const token=active.data.token;
  assert.equal((await req('/v1/auth/activate','',{invite:invite.data.invite,password})).status,400);
  assert.equal((await req('/v1/admin/users',token)).status,403);
  assert.equal((await req('/v1/admin/invites',token,{username:'attacker',name:'X'})).status,403);
  assert.equal((await req('/v1/snapshot',token,{})).status,401);
  assert.equal((await req('/v1/state',token)).status,200);
  assert.equal((await req('/v1/me',token)).data.user.username,'maria.silva');
  const row=await storage.auth.find('maria.silva');assert(row.password_hash.startsWith('scrypt$'));assert(!row.password_hash.includes(password));assert.equal(row.invite_hash,null);
  const list=(await req('/v1/admin/users',admin)).data.users;assert.equal(list.length,1);assert(!JSON.stringify(list).includes('password_hash'));assert(!JSON.stringify(list).includes(token));
  assert.equal((await req('/v1/auth/login','',{username:'maria.silva',password:'incorrect'})).status,401);
  await stop();await start();assert.equal((await req('/v1/state',token)).status,200);
  assert.equal((await req('/v1/admin/access',admin,{id:row.id,action:'block'})).status,200);
  assert.equal((await req('/v1/state',token)).status,401);
  assert.equal((await req('/v1/auth/login','',{username:'maria.silva',password})).status,401);
  await req('/v1/admin/access',admin,{id:row.id,action:'enable'});
  assert.equal((await req('/v1/state',token)).status,401); // Old sessions stay revoked.
  const login=await req('/v1/auth/login','',{username:'maria.silva',password});assert.equal(login.status,200);
  await req('/v1/auth/logout',login.data.token,{});assert.equal((await req('/v1/state',login.data.token)).status,401);
  const again=await req('/v1/auth/login','',{username:'maria.silva',password});
  const reset=await req('/v1/admin/access',admin,{id:row.id,action:'reset'});assert.equal(reset.status,200);
  assert.equal((await req('/v1/state',again.data.token)).status,401);
  assert.equal((await req('/v1/auth/login','',{username:'maria.silva',password})).status,401);
  const accepted=await req('/v1/auth/activate','',{invite:reset.data.invite,password:'Nova senha teste 123!'});assert.equal(accepted.status,200);
  now+=13*3600000;assert.equal((await req('/v1/state',accepted.data.token)).status,401);
  const expired=await req('/v1/admin/invites',admin,{username:'expired',name:'Expirado'});now+=73*3600000;
  assert.equal((await req('/v1/auth/activate','',{invite:expired.data.invite,password})).status,400);
  const revoke=await req('/v1/admin/invites',admin,{username:'revoked',name:'Revogado'});
  const revokeUser=await storage.auth.find('revoked');
  assert.equal((await req('/v1/admin/access',admin,{id:revokeUser.id,action:'block'})).status,200);
  assert.equal((await req('/v1/auth/activate','',{invite:revoke.data.invite,password})).status,400);
  const race=await req('/v1/admin/invites',admin,{username:'race',name:'Race'});
  const results=await Promise.all([req('/v1/auth/activate','',{invite:race.data.invite,password}),req('/v1/auth/activate','',{invite:race.data.invite,password})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[200,400]);
  for(let i=0;i<8;i++)assert.equal((await req('/v1/auth/login','',{username:'unknown',password})).status,401);
  assert.equal((await req('/v1/auth/login','',{username:'unknown',password})).status,429);
  const origin=await fetch(base+'/v1/auth/login',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:JSON.stringify({username:'maria.silva',password})});assert.equal(origin.status,403);
 }finally{await stop();rmSync(dir,{recursive:true});}
});
