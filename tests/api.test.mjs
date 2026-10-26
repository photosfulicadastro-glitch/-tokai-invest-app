import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApi} from '../server/server.mjs';
test('autorização, sincronização idempotente, validação, offline e persistência',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tokai-'));let now=Date.now();const ingestToken='i'.repeat(40),viewerToken='v'.repeat(40),dbPath=join(dir,'test.sqlite');
 let server;async function start(){server=createApi({dbPath,ingestToken,viewerToken,now:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
 async function stop(){await new Promise(r=>server.close(r));}
 await start();
 const request=(path,token,body)=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const d={id:'9999999999999999999',position_id:'1',side:'BUY',entry:0,time:Math.floor(now/1000),volume:.01,price:2500,profit:0,commission:-1,swap:0,fee:0};
 const payload={source:'principal',observed_at:Math.floor(now/1000),symbol:'XAUUSD',currency:'USD',bid:2500,ask:2501,positions:[{id:'1',side:'BUY',volume:.01,price:2500,sl:2400,tp:2600,profit:0}],deals:[d]};
 try{
 assert.equal((await request('/v1/state','wrong')).status,401);
 assert.equal((await request('/v1/snapshot',viewerToken,payload)).status,401);
 assert.equal((await request('/v1/state',ingestToken)).status,401);
 assert.equal((await request('/v1/state',viewerToken)).status,200);
 assert.equal((await request('/v1/snapshot',ingestToken,{...payload,symbol:'EURUSD'})).status,400);
 assert.equal((await request('/v1/snapshot',ingestToken,payload)).status,200);
 assert.equal((await request('/v1/snapshot',ingestToken,payload)).status,200);
 let state=await(await request('/v1/state',viewerToken)).json();assert.equal(state.online,true);assert.equal(state.deals.length,1);assert.equal(state.deals[0].id,d.id);
 now+=31000;state=await(await request('/v1/state',viewerToken)).json();assert.equal(state.online,false);assert.equal(state.state.positions.length,1);
 await stop();await start();state=await(await request('/v1/state',viewerToken)).json();assert.equal(state.deals.length,1);
 assert.equal((await request('/v1/snapshot',ingestToken,{...payload,positions:[],deals:[]})).status,200);state=await(await request('/v1/state',viewerToken)).json();assert.equal(state.state.positions.length,0);assert.equal(state.deals.length,1);
 const cors=await fetch(`http://127.0.0.1:${server.address().port}/v1/state`,{headers:{Origin:'https://evil.example',Authorization:'Bearer '+viewerToken}});assert.equal(cors.status,403);
 }finally{await stop();rmSync(dir,{recursive:true});}
});
