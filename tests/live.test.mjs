import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApi} from '../server/server.mjs';
import {sqliteStore} from '../server/storage.mjs';
import {parseLiveSource,embedUrl} from '../server/live-source.mjs';
const PASSWORD='Senha9!xy',TERMS='signals-copy-risk-v2';
test('parser aceita links e IDs do YouTube e recusa @handle',()=>{
 const id='dQw4w9WgXcQ',ch='UC'+'a'.repeat(22);
 for(const v of [id,'https://www.youtube.com/watch?v='+id,'https://youtu.be/'+id,'https://www.youtube.com/live/'+id+'?si=x','youtube.com/embed/'+id])assert.deepEqual(parseLiveSource(v),{kind:'video',id});
 for(const v of [ch,'https://www.youtube.com/channel/'+ch])assert.deepEqual(parseLiveSource(v),{kind:'channel',id:ch});
 assert.ok(parseLiveSource('https://www.youtube.com/@tokai').error);
 assert.ok(parseLiveSource('https://evil.example/watch?v='+id).error);
 assert.ok(parseLiveSource('').error);
 assert.match(embedUrl({kind:'video',id}),/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
 assert.match(embedUrl({kind:'channel',id:ch}),/embed\/live_stream\?channel=UC/);
});
test('Ao vivo: admin configura, aluno apenas lê',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tokai-live-')),storage=sqliteStore(join(dir,'a.sqlite')),admin='a'.repeat(40);
 const server=createApi({storage,viewerToken:admin,ingestToken:'i'.repeat(40),origin:'https://sinais.tokaiinvest.jp'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const rq=async(path,token='',body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {s:r.status,d:await r.json().catch(()=>({}))};};
 try{
  const inv=(await rq('/v1/admin/invites',admin,{username:'aluno.live',name:'Aluno',plan:'signals'})).d;
  const t=(await rq('/v1/auth/activate','',{invite:inv.invite,password:PASSWORD,terms_accepted:true,terms_version:TERMS})).d.token;
  assert.equal((await rq('/v1/live','')).s,401);
  assert.deepEqual((await rq('/v1/live',t)).d,{enabled:false,embed_url:null});
  assert.equal((await rq('/v1/admin/live',t,{enabled:true})).s,403);
  assert.equal((await rq('/v1/admin/live',admin,{enabled:true})).s,400);
  assert.equal((await rq('/v1/admin/live',admin,{source:'https://www.youtube.com/@x'})).s,400);
  const ok=await rq('/v1/admin/live',admin,{source:'https://youtu.be/dQw4w9WgXcQ',enabled:true});
  assert.equal(ok.s,200);assert.equal(ok.d.enabled,true);
  const r=(await rq('/v1/live',t)).d;assert.equal(r.enabled,true);assert.match(r.embed_url,/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);assert.equal(r.source,undefined);
  assert.equal((await rq('/v1/live',admin)).d.source,'dQw4w9WgXcQ');
  await rq('/v1/admin/live',admin,{enabled:false});
  assert.deepEqual((await rq('/v1/live',t)).d,{enabled:false,embed_url:null});
 }finally{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true});}
});
