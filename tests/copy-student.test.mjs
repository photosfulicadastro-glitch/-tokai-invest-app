import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApi} from '../server/server.mjs';
import {sqliteStore} from '../server/storage.mjs';

test('aluno Copy baixa uma licença própria e não reemite após ativação',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tokai-copy-student-')),path=join(dir,'copy.sqlite');
 const storage=sqliteStore(path),admin='a'.repeat(40),ingest='i'.repeat(40);
 const server=createApi({storage,viewerToken:admin,ingestToken:ingest});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,password='Senha9!xy';
 const request=async(path,token='',body)=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {response,data:response.headers.get('content-type')?.includes('json')?await response.json():null};};
 try{
  const invite=(await request('/v1/admin/invites',admin,{username:'aluno.copy',name:'Aluno Copy',plan:'copy'})).data;
  const activation=await request('/v1/auth/activate','',{invite:invite.invite,password,terms_accepted:true,terms_version:'signals-copy-risk-v2'});
  assert.equal(activation.response.status,200);const token=activation.data.token;
  const user=await storage.auth.find('aluno.copy');
  const agentCreation=await request('/v1/admin/copy/agents',admin,{user_id:user.id,expected_account:'41277716',broker_server:'Exness-MT5Trial3',daily_loss_percent:10});
  assert.equal(agentCreation.response.status,201);const agent=agentCreation.data.agent;
  let me=await request('/v1/copy/me',token);assert.equal(me.response.status,200);assert.equal(me.data.installer.terms_accepted,true);assert.equal(me.data.installer.license,null);
  const first=await request('/v1/copy/installer',token,{});assert.equal(first.response.status,200);assert.equal(first.response.headers.get('content-type'),'application/zip');
  const firstLicense=await storage.copy.currentLicenseForAgent(agent.id);assert.equal(firstLicense.status,'issued');
  const second=await request('/v1/copy/installer',token,{});assert.equal(second.response.status,200);
  const secondLicense=await storage.copy.currentLicenseForAgent(agent.id);assert.equal(secondLicense.status,'issued');assert.notEqual(secondLicense.id,firstLicense.id);
  await storage.copy.activateLicense({id:secondLicense.id,fingerprint:'terminal-fingerprint-01',now:Date.now()});
  const blocked=await request('/v1/copy/installer',token,{});assert.equal(blocked.response.status,409);
  me=await request('/v1/copy/me',token);assert.equal(me.data.installer.license.status,'active');
 }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true});}
});
