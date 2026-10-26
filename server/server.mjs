import http from 'node:http';
import {sqliteStore,postgresStore} from './storage.mjs';
import {createHash,timingSafeEqual} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest();
const allowed=(supplied,expected)=>typeof expected==='string'&&expected.length>=32&&timingSafeEqual(hash(supplied),hash(expected));
export function createApi({dbPath='tokai.sqlite',storage,ingestToken,viewerToken,source='principal',origin='https://photosfulicadastro-glitch.github.io',now=()=>Date.now()}={}) {
 if(!ingestToken||!viewerToken||ingestToken.length<32||viewerToken.length<32||ingestToken===viewerToken)throw Error('Configure duas chaves diferentes, com pelo menos 32 caracteres');
 const db=storage||sqliteStore(dbPath);
 const server=http.createServer(async(req,res)=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(req.headers.origin===origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='Authorization, Content-Type';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
  const send=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
  if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Origem não permitida'});
  if(req.method==='OPTIONS')return send(204,{});
  if(req.url==='/health'&&req.method==='GET'){try{await db.health();return send(200,{ok:true});}catch{return send(503,{ok:false});}}
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  const ingestion=req.url==='/v1/snapshot'&&req.method==='POST';
  if(!allowed(token,ingestion?ingestToken:viewerToken))return send(401,{error:'Acesso não autorizado'});
  try{
   if(ingestion){
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2_000_000)return send(413,{error:'Carga muito grande'});}
    const s=JSON.parse(body);validate(s,source);
    if(!await db.save(s,now()))return send(409,{error:'Snapshot anterior ao estado atual'});
    return send(200,{ok:true});
   }
   if(req.url==='/v1/state'&&req.method==='GET'){
    const {row,deals}=await db.read();
    const state=row?JSON.parse(row.body):null;
    return send(200,{online:!!row&&now()-row.received<30_000&&now()-state.observed_at*1000<30_000,received_at:row?.received??null,state,deals});
   }
   send(404,{error:'Rota não encontrada'});
  }catch(e){send(e instanceof SyntaxError||e.message==='Payload inválido'?400:500,{error:e.message==='Payload inválido'?'Payload inválido':'Não foi possível processar a solicitação'});}
 });
 server.on('close',()=>{db.close().catch(()=>{});});return server;
}
function validate(s,source){
 const fail=()=>{throw Error('Payload inválido')};const num=x=>typeof x==='number'&&Number.isFinite(x);const id=x=>typeof x==='string'&&/^\d{1,20}$/.test(x);
 if(!s||s.source!==source||!num(s.observed_at)||Math.abs(Date.now()/1000-s.observed_at)>300||typeof s.symbol!=='string'||!/^XAUUSD[A-Za-z0-9._-]*$/.test(s.symbol)||!s.currency||!/^[A-Z]{3}$/.test(s.currency)||!Array.isArray(s.positions)||!Array.isArray(s.deals)||s.positions.length>1000||s.deals.length>10000)fail();
 if(!['bid','ask'].every(k=>num(s[k])&&s[k]>=0))fail();
 for(const p of s.positions)if(!id(p.id)||!['BUY','SELL'].includes(p.side)||!['volume','price','sl','tp','profit'].every(k=>num(p[k]))||p.volume<=0)fail();
 for(const d of s.deals)if(!id(d.id)||!id(d.position_id)||!['BUY','SELL'].includes(d.side)||![0,1,2,3].includes(d.entry)||!['time','volume','price','profit','commission','swap','fee'].every(k=>num(d[k]))||d.volume<=0)fail();
 // Optional for compatibility with monitor 1.00. Series are oldest first.
 if(s.candles!==undefined){
  if(!s.candles||Array.isArray(s.candles)||typeof s.candles!=='object'||Object.keys(s.candles).some(k=>!['M1','M5','M15'].includes(k)))fail();
  for(const tf of ['M1','M5','M15']){
   const bars=s.candles[tf];if(!Array.isArray(bars)||bars.length>300)fail();
   let last=0;
   for(const bar of bars){
    if(!bar||!Number.isSafeInteger(bar.time)||bar.time<=last||!['open','high','low','close'].every(k=>num(bar[k])&&bar[k]>0)||bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close))fail();
    last=bar.time;
   }
  }
 }
 if(new Set(s.positions.map(p=>p.id)).size!==s.positions.length)fail();
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL é obrigatória no servidor');
 const storage=await postgresStore(process.env.DATABASE_URL);
 const server=createApi({storage,dbPath:process.env.DB_PATH||'tokai.sqlite',ingestToken:process.env.INGEST_TOKEN,viewerToken:process.env.VIEWER_TOKEN,source:process.env.MT5_SOURCE||'principal',origin:process.env.APP_ORIGIN});
 server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('TOKAI API iniciada'));
}
