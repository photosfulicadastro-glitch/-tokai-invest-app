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
test('candles: compatibilidade, persistência, atualização e rejeição de OHLC inválido',async()=>{
 const server=createApi({dbPath:':memory:',ingestToken:'i'.repeat(40),viewerToken:'v'.repeat(40)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 const post=p=>fetch(url+'/v1/snapshot',{method:'POST',headers:{Authorization:'Bearer '+'i'.repeat(40),'Content-Type':'application/json'},body:JSON.stringify(p)});
 const get=async()=>await(await fetch(url+'/v1/state',{headers:{Authorization:'Bearer '+'v'.repeat(40)}})).json();
 const base={source:'principal',symbol:'XAUUSD',currency:'JPY',observed_at:Math.floor(Date.now()/1000),bid:4000,ask:4001,positions:[],deals:[]};
 const b={time:1800000000,open:4000,high:4005,low:3990,close:4002};
 try{
  assert.equal((await post(base)).status,200);
  const candles={M1:[b],M5:[b],M15:[b]};
  assert.equal((await post({...base,candles})).status,200);
  assert.deepEqual((await get()).state.candles,candles);
  const updated={...candles,M1:[{...b,close:4004}]};
  assert.equal((await post({...base,candles:updated})).status,200);
  assert.equal((await get()).state.candles.M1[0].close,4004);
  for(const bars of [[{...b,high:3999}],[{...b,low:4001}],[b,b],[{...b,close:null}],Array(301).fill(b)]){
   assert.equal((await post({...base,candles:{...candles,M1:bars}})).status,400);
  }
  assert.equal((await get()).state.candles.M1[0].close,4004);
  assert.equal((await post({...base,candles:{M1:[],M5:[],M15:[]}})).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
