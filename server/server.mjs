import http from 'node:http';
import {createPush} from './push.mjs';
import {createAuth,HttpError,readJson,TERMS_VERSION} from './auth.mjs';
import {sqliteStore,postgresStore} from './storage.mjs';
import {createHash,timingSafeEqual,randomBytes,randomUUID} from 'node:crypto';
import {readFile,access} from 'node:fs/promises';
const hash=s=>createHash('sha256').update(s).digest();
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n&0xffff);return b;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
const crc32=data=>{let crc=0xffffffff;for(const byte of data){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;};
// Arquivo ZIP sem compressão para não depender de bibliotecas externas no servidor.
const zip=entries=>{let offset=0;const local=[],central=[];for(const entry of entries){const name=Buffer.from(entry.name,'utf8'),body=Buffer.isBuffer(entry.body)?entry.body:Buffer.from(entry.body,'utf8'),sum=crc32(body);const part=Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04]),u16(20),u16(0x800),u16(0),u16(0),u16(0),u32(sum),u32(body.length),u32(body.length),u16(name.length),u16(0),name,body]);local.push(part);central.push(Buffer.concat([Buffer.from([0x50,0x4b,0x01,0x02]),u16(20),u16(20),u16(0x800),u16(0),u16(0),u16(0),u32(sum),u32(body.length),u32(body.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]));offset+=part.length;}const directory=Buffer.concat(central),end=Buffer.concat([Buffer.from([0x50,0x4b,0x05,0x06]),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(directory.length),u32(offset),u16(0)]);return Buffer.concat([...local,directory,end]);};
const cleanSetValue=value=>String(value??'').replace(/[\r\n]/g,'').trim();
async function monitorZip({key,name,account,origin}){
 const executable=await readFile(new URL('../mt5/TokaiMonitor.ex5',import.meta.url));
 const settings=[
  '; TOKAI MONITOR — configuração individual de '+cleanSetValue(name)+'. Não compartilhe este arquivo.',
  'ApiUrl='+cleanSetValue(origin).replace(/\/$/,'')+'/api',
  'IngestToken='+cleanSetValue(key),
  'Source=principal',
  'GoldSymbol=XAUUSD',
  'ExpectedAccount='+cleanSetValue(account),
  'HistoryDays=30',
  ''
 ].join('\r\n');
 const readme=[
  'TOKAI MONITOR — PACOTE DO COMPUTADOR "'+cleanSetValue(name)+'"',
  '',
  'Este monitor apenas LÊ a conta-mãe (login '+cleanSetValue(account)+') e envia os dados ao servidor Tokai. Ele não opera.',
  'A chave deste pacote é exclusiva deste computador e pode ser revogada no painel sem afetar os outros.',
  '',
  'INSTALAÇÃO',
  '1. No MetaTrader 5 logado na conta-mãe, abra Arquivo > Abrir Pasta de Dados > MQL5 > Experts.',
  '2. Copie TokaiMonitor.ex5 para essa pasta e reinicie o MT5 (ou clique com o botão direito em Experts > Atualizar).',
  '3. Em Ferramentas > Opções > Expert Advisors, marque Permitir WebRequest e adicione https://sinais.tokaiinvest.jp',
  '4. Abra um gráfico XAUUSD (ou o símbolo de ouro da corretora) e arraste o TokaiMonitor para ele.',
  '5. Na aba Inputs, clique em Carregar e escolha TokaiMonitor.set deste pacote. Se o símbolo do ouro tiver outro nome, ajuste GoldSymbol.',
  '6. Ative Algo Trading (botão no topo do MT5) e confirme o rosto sorridente no canto do gráfico.',
  '7. No painel Tokai, em Acessos > Monitores, a coluna ÚLTIMO ENVIO deve atualizar em poucos segundos.',
  '',
  'IMPORTANTE',
  '- Deixe o relógio do Windows em horário automático; diferença acima de 5 minutos faz o servidor recusar os dados.',
  '- O monitor só envia quando o MT5 está conectado e logado exatamente na conta '+cleanSetValue(account)+'.',
  '- Não compartilhe este pacote: quem tiver o .set consegue enviar dados em nome deste computador.',
  ''
 ].join('\r\n');
 return zip([{name:'TokaiMonitor.ex5',body:executable},{name:'TokaiMonitor.set',body:settings},{name:'LEIA-ME.txt',body:readme}]);
}
async function installerZip({license,agent,origin}){
 const apiUrl=cleanSetValue(origin).replace(/\/$/,'')+'/api';
 const settings=[
  '; TOKAI COPY — configuração individual. Não compartilhe este arquivo.',
  'ApiUrl='+apiUrl,
  'License='+cleanSetValue(license),
  'ExpectedAccount='+cleanSetValue(agent.expected_account),
  'ExpectedServer='+cleanSetValue(agent.broker_server),
  'GoldSymbol=XAUUSD',
  'LocalDailyLossPercent='+Number(agent.daily_loss_percent),
  'VolumeMultiplier=1.0',
  'TokaiMagic=41277716',
  'MaxSlippagePoints=30',
  'MasterMaxAgeSeconds=30',
  'PollSeconds=1',
  ''
 ].join('\r\n');
 const readme=[
  'TOKAI COPY — INSTALADOR INDIVIDUAL',
  '',
  'Esta instalação é vinculada à conta MT5 '+cleanSetValue(agent.expected_account)+' no servidor '+cleanSetValue(agent.broker_server)+'.',
  'A licença é única e é ativada na primeira instalação válida. Não copie ou compartilhe este pacote.',
  '',
  'INSTALAÇÃO',
  '1. No MetaTrader 5, abra Arquivo > Abrir Pasta de Dados > MQL5 > Experts.',
  '2. Copie TokaiCopyFollower.ex5 para a pasta Experts. Se o pacote trouxer somente o arquivo .mq5, abra-o no MetaEditor e compile para gerar o .ex5.',
  '3. Anexe o EA compilado a um gráfico do XAUUSD da conta vinculada.',
  '4. Em Ferramentas > Opções > Expert Advisors, adicione https://sinais.tokaiinvest.jp à lista de WebRequest permitido.',
  '5. Na aba Inputs do EA, use Carregar e selecione TokaiCopyFollower.set deste pacote.',
  '6. Ative Permitir negociação algorítmica quando o modo global do Copy autorizar esta conta.',
  '7. A configuração padrão consulta a conta-mãe a cada 1 segundo (PollSeconds).',
  '',
  'A senha da corretora nunca é solicitada nem enviada pela Tokai.',
  'Este EA exige conta MT5 em modo hedging; contas netting não são compatíveis.',
  'O limite diário é aplicado pelo EA (base de equity do dia, fuso do Japão, mantida após reiniciar o MT5); ele pausa somente novas entradas copiadas.',
  ''
 ].join('\r\n');
 const executable=await readFile(new URL('../mt5/TokaiCopyFollower.ex5',import.meta.url));
 return zip([{name:'TokaiCopyFollower.ex5',body:executable},{name:'TokaiCopyFollower.set',body:settings},{name:'LEIA-ME.txt',body:readme}]);
}
const allowed=(supplied,expected)=>typeof expected==='string'&&expected.length>=32&&timingSafeEqual(hash(supplied),hash(expected));
const copyServiceActive=(entry,time)=>entry?.user_status==='active'&&entry?.membership_status==='active'&&(!entry.membership_access_until||Number(entry.membership_access_until)>=time);
const copyAccessUntil=value=>{if(value===null||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return undefined;const time=Date.parse(value+'T14:59:59.999Z');return Number.isSafeInteger(time)&&time>0?time:undefined;};
export function createApi({dbPath='tokai.sqlite',storage,ingestToken,viewerToken,source='principal',origin='https://photosfulicadastro-glitch.github.io',now=()=>Date.now()}={}) {
 if(!ingestToken||!viewerToken||ingestToken.length<32||viewerToken.length<32||ingestToken===viewerToken)throw Error('Configure duas chaves diferentes, com pelo menos 32 caracteres');
 const db=storage||sqliteStore(dbPath);
 const syncPlan=async({userId,plan,status,accessUntil,now:time})=>await db.copy.setCopyMembership({userId,status:(plan==='copy'||plan==='signals_copy')&&status==='active'?'active':'paused',accessUntil,now:time});
 const auth=createAuth(db.auth,now,value=>allowed(value,viewerToken),syncPlan,{
  taken:async(account,server)=>!!await db.copy.agentByAccount(account,server),
  create:async({userId,account,server,now:time})=>{const settings=await db.copy.settings();await db.copy.createAgent({id:randomUUID(),userId,expectedAccount:account,brokerServer:server,tokenHash:createHash('sha256').update(randomBytes(32)).digest('hex'),dailyLossPercent:Math.min(10,Number(settings.max_daily_loss_percent)),now:time});}
 });
 const historyStart=Number(process.env.HISTORY_START_UNIX||0);
 const pushReady=createPush(db.push,{now});
 const drain=()=>pushReady.then(p=>p.drain()).catch(()=>console.error('Entrega de notificações pendente'));
 const pushTimer=setInterval(drain,2000);pushTimer.unref();
 const server=http.createServer(async(req,res)=>{
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(req.headers.origin===origin){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='Authorization, Content-Type';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
  const send=(status,data)=>{res.writeHead(status,headers);res.end(JSON.stringify(data));};
  const sendZip=(filename,body)=>{res.writeHead(200,{...headers,'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+filename+'"','Content-Length':String(body.length)});res.end(body);};
  if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Origem não permitida'});
  if(req.method==='OPTIONS')return send(204,{});
  if(req.url==='/health'&&req.method==='GET'){try{await db.health();return send(200,{ok:true});}catch{return send(503,{ok:false});}}
  const token=(req.headers.authorization||'').replace(/^Bearer /,'');
  const ingestion=req.url==='/v1/snapshot'&&req.method==='POST';
  try{
   const user=allowed(token,viewerToken)?{role:'admin',name:'Administrador'}:!ingestion?await auth.resolve(token):null;
   const isAdmin=user?.role==='admin';
   if(req.url==='/v1/admin/copy/close-all'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req),agent=typeof b.user_id==='string'?await db.copy.agentForUser(b.user_id):null;
    if(!agent)return send(404,{error:'Este aluno não tem agente Copy.'});
    await db.copy.requestCloseAll(agent.id,now());return send(200,{ok:true});
   }
   if(req.url==='/v1/admin/monitors'&&req.method==='GET'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    return send(200,{monitors:await db.auth.monitorList()});
   }
   if(req.url==='/v1/admin/monitors'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req),name=typeof b.name==='string'?b.name.trim():'';
    if(!name||name.length>80)return send(400,{error:'Informe um nome de até 80 caracteres para o computador.'});
    const key=randomBytes(32).toString('base64url');
    const monitor=await db.auth.monitorCreate({id:randomUUID(),name,hash:createHash('sha256').update(key).digest('hex'),now:now()});
    return send(201,{monitor,key});
   }
   if(req.url==='/v1/admin/monitors/package'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req),name=typeof b.name==='string'?b.name.trim():'',account=String(b.account??'').trim();
    if(!name||name.length>80)return send(400,{error:'Informe um nome de até 80 caracteres para o computador.'});
    if(!/^[0-9]{3,12}$/.test(account))return send(400,{error:'Informe o login numérico da conta-mãe MT5.'});
    try{await access(new URL('../mt5/TokaiMonitor.ex5',import.meta.url));}catch{return send(503,{error:'O arquivo TokaiMonitor.ex5 ainda não está no servidor.'});}
    const key=randomBytes(32).toString('base64url');
    await db.auth.monitorCreate({id:randomUUID(),name,hash:createHash('sha256').update(key).digest('hex'),now:now()});
    const bundle=await monitorZip({key,name,account,origin});
    return sendZip('tokai-monitor-'+name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)+'.zip',bundle);
   }
   if(req.url==='/v1/admin/monitors/revoke'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req);
    if(typeof b.id!=='string'||!await db.auth.monitorRevoke(b.id,now()))return send(404,{error:'Chave não encontrada ou já revogada.'});
    return send(200,{ok:true});
   }
   if(req.url==='/v1/admin/copy/overview'&&req.method==='GET'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const [settings,users,events]=await Promise.all([db.copy.settings(),db.auth.list(),db.copy.recentEvents(80)]);
    const agents=await Promise.all(users.map(async u=>({user:u,agent:await db.copy.agentForUser(u.id),membership:await db.copy.copyMembership(u.id),registration:u.requested_mt5_account?{mt5_account:u.requested_mt5_account,broker_server:u.requested_broker_server,requested_plan:u.requested_plan,terms_accepted_at:u.terms_accepted_at}:null})));
    return send(200,{settings,agents,events});
   }
   if(req.url==='/v1/admin/copy/installers'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req);if(typeof b.agent_id!=='string')return send(400,{error:'Agente inválido.'});
    const agent=await db.copy.agentById(b.agent_id);if(!agent)return send(404,{error:'Agente não encontrado.'});
    if(!await db.copy.copyAccess(agent.user_id,now()))return send(403,{error:'A assinatura Copy deste aluno está pausada ou expirada.'});
    await db.copy.revokeLicenses({agentId:agent.id,now:now()});
    const license=randomBytes(32).toString('base64url');
    const issued=await db.copy.issueLicense({id:randomUUID(),agentId:agent.id,licenseHash:createHash('sha256').update(license).digest('hex'),now:now()});
    await db.copy.markLicenseDownloaded({id:issued.id,now:now()});
    const bundle=await installerZip({license,agent,origin});
    return sendZip('tokai-copy-'+agent.expected_account+'.zip',bundle);
   }
   if(req.url==='/v1/admin/copy/licenses/revoke'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req);if(typeof b.agent_id!=='string')return send(400,{error:'Agente inválido.'});
    await db.copy.revokeLicenses({agentId:b.agent_id,now:now()});return send(200,{ok:true});
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
   if(req.url==='/v1/admin/copy/memberships'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req),status=['active','paused'].includes(b.status)?b.status:null,accessUntil=copyAccessUntil(b.access_until);
    if(typeof b.user_id!=='string'||!status||accessUntil===undefined)return send(400,{error:'Assinatura Copy inválida.'});
    const users=await db.auth.list();if(!users.some(u=>u.id===b.user_id))return send(404,{error:'Aluno não encontrado.'});
    return send(200,{membership:await db.copy.setCopyMembership({userId:b.user_id,status,accessUntil,now:now()})});
   }
   if(req.url==='/v1/admin/copy/agents'&&req.method==='POST'){
    if(!isAdmin)return send(403,{error:'Acesso administrativo necessário.'});
    const b=await readJson(req),account=String(b.expected_account||'').trim(),server=String(b.broker_server||'').trim(),loss=Number(b.daily_loss_percent);
    if(typeof b.user_id!=='string'||!/^[0-9]{4,20}$/.test(account)||server.length<3||server.length>120||!Number.isFinite(loss)||loss<=0||loss>100)return send(400,{error:'Dados do agente inválidos.'});
    const settings=await db.copy.settings();if(loss>settings.max_daily_loss_percent)return send(400,{error:'O limite do aluno não pode superar o teto da Tokai.'});
    if(!await db.copy.copyAccess(b.user_id,now()))return send(400,{error:'Ative primeiro a assinatura Copy deste aluno.'});
    const taken=await db.copy.agentByAccount(account,server);if(taken&&taken.user_id!==b.user_id)return send(409,{error:'Esta conta MT5 já está vinculada a outro aluno.'});
    const agentToken=randomBytes(32).toString('base64url');const agent=await db.copy.createAgent({id:randomUUID(),userId:b.user_id,expectedAccount:account,brokerServer:server,tokenHash:createHash('sha256').update(agentToken).digest('hex'),dailyLossPercent:loss,now:now()});
    if(!agent)return send(409,{error:'Este aluno já possui agente Copy configurado.'});
    return send(201,{agent,token:agentToken});
   }
   
   if(req.url==='/v1/copy/me'&&req.method==='GET'){
    if(!user||isAdmin)return send(403,{error:'Acesso de aluno necessário.'});
    const [membership,agent,settings,termsAccepted]=await Promise.all([db.copy.copyMembership(user.id),db.copy.agentForUser(user.id),db.copy.settings(),db.auth.termsAccepted(user.id,TERMS_VERSION)]);
    const [events,currentLicense]=agent?await Promise.all([db.copy.eventsForAgent(agent.id,30),db.copy.currentLicenseForAgent(agent.id)]):[[],null];
    const license=currentLicense?{status:currentLicense.status,issued_at:currentLicense.issued_at,downloaded_at:currentLicense.downloaded_at,activated_at:currentLicense.activated_at,last_seen_at:currentLicense.last_seen_at}:null;
    return send(200,{membership,agent,settings:{max_daily_loss_percent:settings.max_daily_loss_percent,execution_mode:settings.execution_mode},events,installer:{terms_accepted:termsAccepted,terms_version:TERMS_VERSION,license}});
   }
   if(req.url==='/v1/copy/terms'&&req.method==='POST'){
    if(!user||isAdmin||!['copy','signals_copy'].includes(user.plan_code))return send(403,{error:'Plano Copy necessário.'});
    const b=await readJson(req);
    if(b.terms_accepted!==true||b.terms_version!==TERMS_VERSION)return send(400,{error:'Leia e aceite o Termo de Ciência de Riscos.'});
    await db.auth.acceptTerms(user.id,TERMS_VERSION,now());return send(200,{ok:true});
   }
   if(req.url==='/v1/copy/installer'&&req.method==='POST'){
    if(!user||isAdmin||!['copy','signals_copy'].includes(user.plan_code))return send(403,{error:'Plano Copy necessário.'});
    const time=now(),[membership,agent,termsAccepted]=await Promise.all([db.copy.copyMembership(user.id),db.copy.agentForUser(user.id),db.auth.termsAccepted(user.id,TERMS_VERSION)]);
    if(!copyServiceActive({user_status:'active',membership_status:membership?.status,membership_access_until:membership?.access_until},time))return send(403,{error:'Sua assinatura Copy está pausada ou expirada.'});
    if(!termsAccepted)return send(403,{error:'Aceite o Termo de Ciência de Riscos antes de baixar.'});
    if(!agent)return send(409,{error:'Sua conta MT5 ainda não foi vinculada pela equipe Tokai.'});
    const current=await db.copy.currentLicenseForAgent(agent.id);
    if(current?.status==='active')return send(409,{error:'Este instalador já está ativo. Solicite à equipe Tokai a substituição da licença.'});
    if(current?.status==='issued')await db.copy.revokeLicenses({agentId:agent.id,now:time});
    const license=randomBytes(32).toString('base64url');
    const issued=await db.copy.issueLicense({id:randomUUID(),agentId:agent.id,licenseHash:createHash('sha256').update(license).digest('hex'),now:time});
    await db.copy.markLicenseDownloaded({id:issued.id,now:time});
    const bundle=await installerZip({license,agent,origin});
    return sendZip('tokai-copy-'+agent.expected_account+'.zip',bundle);
   }
   if(req.url==='/v1/copy/preferences'&&req.method==='POST'){
    if(!user||isAdmin)return send(403,{error:'Acesso de aluno necessário.'});
    const b=await readJson(req),loss=Number(b.daily_loss_percent),time=now();
    const [membership,agent,settings]=await Promise.all([db.copy.copyMembership(user.id),db.copy.agentForUser(user.id),db.copy.settings()]);
    if(!copyServiceActive({user_status:'active',membership_status:membership?.status,membership_access_until:membership?.access_until},time))return send(403,{error:'Assinatura Copy indisponível.'});
    if(!agent)return send(400,{error:'Sua conta MT5 ainda não foi cadastrada.'});
    const maximum=Math.min(Number(agent.daily_loss_percent),Number(settings.max_daily_loss_percent));
    if(!Number.isFinite(loss)||loss<=0||loss>maximum)return send(400,{error:'Você pode apenas reduzir seu limite, até '+maximum+'%.'});
    return send(200,{agent:await db.copy.setAgentLimit({userId:user.id,dailyLossPercent:loss,now:time})});
   }
   if(req.url==='/v1/copy/plan'&&req.method==='POST'){
    const b=await readJson(req);const license=typeof b.license==='string'?b.license:'';const account=String(b.account||''),serverName=String(b.server||''),fingerprint=String(b.fingerprint||''),equity=Number(b.equity);
    if(!/^[A-Za-z0-9_-]{43}$/.test(license)||!/^[0-9]{4,20}$/.test(account)||serverName.length<3||serverName.length>120||fingerprint.length<16||fingerprint.length>200||!Number.isFinite(equity)||equity<=0)return send(400,{error:'Dados do agente inválidos.'});
    const entry=await db.copy.license(createHash('sha256').update(license).digest('hex'));
    if(!entry||entry.status!=='active'||entry.expected_account!==account||entry.broker_server!==serverName||entry.terminal_fingerprint!==fingerprint)return send(403,{error:'Agente não autorizado.'});
    const active=copyServiceActive(entry,now());
    let closeAll=false;
    if(active)await db.copy.clearCloseRequest(entry.agent_id);else closeAll=await db.copy.closeRequested(entry.agent_id);
    const settings=await db.copy.settings();const {row}=await db.read();const master=row?JSON.parse(row.body):null;
    await db.copy.heartbeat({id:entry.agent_id,status:'connected',equity,error:null,now:now()});
    return send(200,{exit_only:!active,close_all:closeAll,execution_mode:settings.execution_mode,max_daily_loss_percent:Math.min(Number(entry.daily_loss_percent),Number(settings.max_daily_loss_percent)),symbol:'XAUUSD',master:master?{observed_at:master.observed_at,symbol:master.symbol,positions:master.positions}:null});
   }
   if(req.url==='/v1/copy/report'&&req.method==='POST'){
    const b=await readJson(req),license=typeof b.license==='string'?b.license:'',account=String(b.account||''),serverName=String(b.server||''),fingerprint=String(b.fingerprint||''),equity=Number(b.equity),eventType=String(b.event_type||''),message=typeof b.message==='string'?b.message.trim():'',masterPositionId=b.master_position_id===undefined||b.master_position_id===''?null:String(b.master_position_id),copiedTicket=b.copied_ticket===undefined||b.copied_ticket===''?null:String(b.copied_ticket);
    if(!/^[A-Za-z0-9_-]{43}$/.test(license)||!/^[0-9]{4,20}$/.test(account)||serverName.length<3||serverName.length>120||fingerprint.length<16||fingerprint.length>200||!Number.isFinite(equity)||equity<=0||!['activated','status','opened','modified','reduced','closed','blocked','error'].includes(eventType)||message.length<1||message.length>280||(masterPositionId!==null&&!/^[0-9]{1,20}$/.test(masterPositionId))||(copiedTicket!==null&&!/^[0-9]{1,20}$/.test(copiedTicket)))return send(400,{error:'Relatório de agente inválido.'});
    const entry=await db.copy.license(createHash('sha256').update(license).digest('hex'));
    if(!entry||entry.status!=='active'||entry.expected_account!==account||entry.broker_server!==serverName||entry.terminal_fingerprint!==fingerprint)return send(403,{error:'Agente não autorizado.'});
    if(entry.user_status!=='active')return send(403,{error:'Agente não autorizado.'});
    const time=now(),status=eventType==='error'?'error':eventType==='blocked'?'blocked':'connected';
    await db.copy.recordEvent({id:randomUUID(),agentId:entry.agent_id,licenseId:entry.id,eventType,masterPositionId,copiedTicket,message,now:time});
    await db.copy.heartbeat({id:entry.agent_id,status,equity,error:eventType==='error'?message:null,now:time});
    return send(200,{ok:true});
   }
   if(req.url==='/v1/copy/activate'&&req.method==='POST'){
    const b=await readJson(req);const license=typeof b.license==='string'?b.license:'';const account=String(b.account||''),serverName=String(b.server||''),fingerprint=String(b.fingerprint||'');
    if(!/^[A-Za-z0-9_-]{43}$/.test(license)||!/^[0-9]{4,20}$/.test(account)||serverName.length<3||serverName.length>120||fingerprint.length<16||fingerprint.length>200)return send(400,{error:'Dados de ativação inválidos.'});
    const entry=await db.copy.license(createHash('sha256').update(license).digest('hex'));
    if(!entry||entry.status==='revoked'||entry.expected_account!==account||entry.broker_server!==serverName)return send(403,{error:'Licença não autorizada para esta conta.'});
    if(!copyServiceActive(entry,now()))return send(403,{error:'Assinatura Copy indisponível.'});
    if(entry.status==='active'&&entry.terminal_fingerprint!==fingerprint)return send(403,{error:'Licença já ativada em outra instalação.'});
    if(entry.status==='issued')await db.copy.activateLicense({id:entry.id,fingerprint,now:now()});
    const settings=await db.copy.settings();
    return send(200,{ok:true,execution_mode:settings.execution_mode,max_daily_loss_percent:Math.min(Number(entry.daily_loss_percent),Number(settings.max_daily_loss_percent)),symbol:'XAUUSD'});
   }
   if(await auth.route(req,send,isAdmin,token))return;
   let monitorId=null;
   if(ingestion&&!allowed(token,ingestToken)){
    const found=/^[A-Za-z0-9_-]{43}$/.test(token)?await db.auth.monitorByHash(createHash('sha256').update(token).digest('hex')):null;
    if(!found)return send(401,{error:'Acesso não autorizado'});monitorId=found.id;
   }else if(!ingestion&&!user)return send(401,{error:'Acesso não autorizado'});
   const signalsPlan=isAdmin||['signals','signals_copy'].includes(user?.plan_code);
   if((req.url==='/v1/state'||req.url.startsWith('/v1/push'))&&user&&!signalsPlan)return send(403,{error:'Seu plano não inclui o painel de sinais.'});
   if(await (await pushReady).route(req,send,user))return;
   if(req.url==='/v1/me'&&req.method==='GET')return send(200,{user});
   if(ingestion){
    const s=await readJson(req,2_000_000);validate(s,source);
    if(historyStart>0)s.deals=s.deals.filter(d=>Number(d.time)>=historyStart);
    if(monitorId)await db.auth.monitorSeen(monitorId,now());
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
