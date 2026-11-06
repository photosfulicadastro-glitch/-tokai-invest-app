import http from 'node:http';
import {createPush} from './push.mjs';
import {createAuth,HttpError,readJson} from './auth.mjs';
import {sqliteStore,postgresStore} from './storage.mjs';
import {createHash,timingSafeEqual,randomBytes,randomUUID} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest();
const allowed=(supplied,expected)=>typeof expected==='string'&&expected.length>=32&&timingSafeEqual(hash(supplied),hash(expected));
export function createApi({dbPath='tokai.sqlite',storage,ingestToken,viewerToken,source='principal',origin='https://photosfulicadastro-glitch.github.io',now=()=>Date.now()}={}) {
 if(!ingestToken||!viewerToken||ingestToken.length<32||viewerToken.length<32||ingestToken===viewerToken)throw Error('Configure duas chaves diferentes, com pelo menos 32 caracteres');
 const db=storage||sqliteStore(dbPath);
 const auth=createAuth(db.auth,now,value=>allowed(value,viewerToken));
 const historyStart=Number(process.env.HISTORY_START_UNIX||0);
 const pushReady=createPush(db.push,{now});
 const drain=()=>pushReady.then(p=>p.drain()).catch(()=>console.error('Entrega de notificações pendente'));
 const pushTimer=setInterval(drain,2000);pushTimer.unref();
 const server=http.createServer(async(req,res)=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(req.headers.origin===origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='Authorization, Content-Type';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
  const send=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
  if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Origem não permitida'});
  if(req.method==='OPTIONS')return send(204,{});
  if(req.url==='/health'&&req.method==='GET'){try{await db.health();return send(200,{ok:true});}catch{return send(503,{ok:false});}}
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  const ingestion=req.url==='/v1/snapshot'&&req.method==='POST';
  try{
   const user=allowed(token,viewerToken)?{role:'admin',name:'Administrador'}:!ingestion?await auth.resolve(token):null;
   const isAdmin=user?.role==='admin';
   if(req.url==='/v1/copy/activate'&&req.method==='POST'){
    const b=await readJson(req);const license=typeof b.license==='string'?b.license:'';const account=String(b.account||''),serverName=String(b.server||''),fingerprint=String(b.fingerprint||'');
    if(!/^[A-Za-z0-9_-]{43}$/.test(license)||!/^[0-9]{4,20}$/.test(account)||serverName.length<3||serverName.length>120||fingerprint.length<16||fingerprint.length>200)return send(400,{error:'Dados de ativação inválidos.'});
    const entry=await db.copy.license(createHash('sha256').update(license).digest('hex'));
    if(!entry||entry.status==='revoked'||entry.expected_account!==account||entry.broker_server!==serverName)return send(403,{error:'Licença não autorizada para esta conta.'});
    if(entry.status==='active'&&entry.terminal_fingerprint!==fingerprint)return send(403,{error:'Licença já ativada em outra instalação.'});
    if(entry.status==='issued')await db.copy.activateLicense({id:entry.id,fingerprint,now:now()});
    const settings=await db.copy.settings();
    return send(200,{ok:true,execution_mode:settings.execution_mode,max_daily_loss_percent:Math.min(Number(entry.daily_loss_percent),Number(settings.max_daily_loss_percent)),symbol:'XAUUSD'});
   }
   if(await auth.route(req,send,isAdmin,token))return;
   if(req.url==='/v1/admin/copy/overview'&&req.method==='GET'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const [settings,users]=await Promise.all([db.copy.settings(),db.auth.list()]);
    const agents=await Promise.all(users.map(async u=>({user:u,agent:await db.copy.agentForUser(u.id)})));
    return send(200,{settings,agents});
   }
   if(req.url==='/v1/admin/copy/licenses'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req);if(typeof b.agent_id!=='string')return send(400,{error:'Agente inválido.'});
    await db.copy.revokeLicenses({agentId:b.agent_id,now:now()});
    const license=randomBytes(32).toString('base64url');const issued=await db.copy.issueLicense({id:randomUUID(),agentId:b.agent_id,licenseHash:createHash('sha256').update(license).digest('hex'),now:now()});
    return send(201,{license_id:issued.id,license,issued_at:issued.issued_at});
   }
   if(req.url==='/v1/admin/copy/settings'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req),mode=['off','demo','real','both'].includes(b.execution_mode)?b.execution_mode:null,loss=Number(b.max_daily_loss_percent);
    if(!mode||!Number.isFinite(loss)||loss<=0||loss>100)return send(400,{error:'Configuração de Copy inválida.'});
    return send(200,{settings:await db.copy.setSettings({executionMode:mode,maxDailyLossPercent:loss,now:now()})});
   }
   if(req.url==='/v1/admin/copy/agents'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req),account=String(b.expected_account||'').trim(),server=String(b.broker_server||'').trim(),loss=Number(b.daily_loss_percent);
    if(typeof b.user_id!=='string'||!/^[0-9]{4,20}$/.test(account)||server.length<3||server.length>120||!Number.isFinite(loss)||loss<=0||loss>100)return send(400,{error:'Dados do agente inválidos.'});
    const settings=await db.copy.settings();if(loss>settings.max_daily_loss_percent)return send(400,{error:'O limite do aluno não pode superar o teto da Tokai.'});
    const agentToken=randomBytes(32).toString('base64url');const agent=await db.copy.createAgent({id:randomUUID(),userId:b.user_id,expectedAccount:account,brokerServer:server,tokenHash:createHash('sha256').update(agentToken).digest('hex'),dailyLossPercent:loss,now:now()});
    if(!agent)return send(409,{error:'Este aluno já possui agente Copy configurado.'});
    return send(201,{agent,token:agentToken});
   }
   if(ingestion?!allowed(token,ingestToken):!user)return send(401,{error:'Acesso não autorizado'});
   if(await (await pushReady).route(req,send,user))return;
   if(req.url==='/v1/me'&&req.method==='GET')return send(200,{user});
   if(ingestion){
    const s=await readJson(req,2_000_000);validate(s,source);
    if(historyStart>0)s.deals=s.deals.filter(d=>Number(d.time)>=historyStart);
    if(!await db.save(s,now()))return send(409,{error:'Snapshot anterior ao estado atual'});
    void drain();return send(200,{ok:true});
   }
   if(req.url==='/v1/state'&&req.method==='GET'){
    const {row,deals}=await db.read();
    const state=row?JSON.parse(row.body):null;
    return send(200,{online:!!row&&now()-row.received<30_000&&now()-state.observed_at*1000<30_000,received_at:row?.received??null,state,deals});
   }
   send(404,{error:'Rota não encontrada'});
  }catch(e){if(e instanceof HttpError)return send(e.status,{error:e.message});send(e instanceof SyntaxError||e.message==='Payload inválido'?400:500,{error:e.message==='Payload inválido'?'Payload inválido':'Não foi possível processar a solicitação'});}
 });
 server.on('close',()=>{clearInterval(pushTimer);db.close().catch(()=>{});});return server;
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
