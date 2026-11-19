// Integração Portal TOKAI -> Sistema de Sinais. Tudo aqui é novo: sem INTEGRATION_SECRET a API fica desligada.
import {createHash,createHmac,randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {HttpError,readJson,publicUser,TERMS_VERSION} from './auth.mjs';
const PLANS=['signals','copy','signals_copy','room'];
const sha=s=>createHash('sha256').update(s).digest('hex');
async function rawBody(req,limit=16384){
 let size=0;const chunks=[];
 for await(const c of req){size+=c.length;if(size>limit)throw new HttpError(413,'Solicitação muito grande.');chunks.push(c);}
 return Buffer.concat(chunks);
}
export function signRequest(secret,{timestamp,method,path,body=''}){
 return createHmac('sha256',secret).update(`${timestamp}.${method}.${path}.${sha(body)}`).digest('hex');
}
function clientIp(req){
 const xff=String(req.headers['x-forwarded-for']||'').split(',').map(s=>s.trim()).filter(Boolean);
 return (xff.length?xff[xff.length-1]:req.socket?.remoteAddress||'').replace(/^::ffff:/,'');
}
export function createIntegration({repo,copy,syncPlan,copyHooks={},now=()=>Date.now(),config={},roomOnly=false,toPublic=publicUser}){
 const {keyId,secret,allowedIps=[],appUrl='https://traderoom.tokaiinvest.jp'}=config;
 const enabled=typeof keyId==='string'&&/^[A-Za-z0-9_-]{3,40}$/.test(keyId)&&typeof secret==='string'&&secret.length>=32;
 const hits=new Map();
 function limit(key,max,ms){
  const t=now();for(const [k,v] of hits)if(v.until<=t)hits.delete(k);
  const e=hits.get(key)||{count:0,until:t+ms};e.count++;hits.set(key,e);
  if(e.count>max)throw new HttpError(429,'Muitas solicitações.');
 }
 const pid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v)?v:null;
 async function exchange(req,send){
  limit('sso-exchange',60,60000);
  const b=await readJson(req);
  if(typeof b.ticket!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(b.ticket))throw new HttpError(401,'Link de entrada inválido ou expirado.');
  const t=now(),used=await repo.ssoConsume(sha(b.ticket),t);
  if(!used)throw new HttpError(401,'Link de entrada inválido ou expirado.');
  const value=randomBytes(32).toString('base64url'),expires=t+12*3600000;
  if(!await repo.ssoSession(sha(value),used.user_id,expires,t))throw new HttpError(403,'Acesso indisponível. Fale com a equipe Tokai.');
  send(200,{token:value,expires_at:expires,user:toPublic(await repo.profile(used.user_id))});
 }
 async function upsert(portalId,b){
  const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';
  const name=typeof b.name==='string'?b.name.trim():'';
  if(!/^[^@\s]{1,64}@[^@\s]{1,120}$/.test(email)||email.length>150||!name||name.length>80)throw new HttpError(422,'Informe e-mail e nome válidos.');
  if(!PLANS.includes(b.plan))throw new HttpError(422,'Plano inválido.');
  const plan=roomOnly?'room':b.plan;
  if(!['active','paused'].includes(b.status))throw new HttpError(422,'Status inválido.');
  let until=null;
  if(b.access_until!==null&&b.access_until!==undefined){until=Date.parse(b.access_until);if(typeof b.access_until!=='string'||!Number.isSafeInteger(until)||until<=0)throw new HttpError(422,'access_until inválido (use data ISO 8601).');}
  if(b.status==='active'&&until===null)throw new HttpError(422,'Plano ativo exige access_until.');
  const locale=b.locale===undefined?'pt':['pt','en'].includes(b.locale)?b.locale:null;
  const billing=b.billing_state===undefined?null:typeof b.billing_state==='string'&&/^[a-z_]{1,30}$/.test(b.billing_state)?b.billing_state:undefined;
  if(!locale||billing===undefined)throw new HttpError(422,'locale ou billing_state inválido.');
  if(b.is_tokai_student!==undefined&&typeof b.is_tokai_student!=='boolean')throw new HttpError(422,'is_tokai_student deve ser verdadeiro ou falso.');
  const needsCopy=!roomOnly&&(plan==='copy'||plan==='signals_copy');
  const account=b.mt5_account===undefined||b.mt5_account===null?'':String(b.mt5_account).trim(),server=typeof b.broker_server==='string'?b.broker_server.trim():'';
  if(account&&(!/^[0-9]{4,20}$/.test(account)||server.length<3||server.length>120))throw new HttpError(422,'Conta MT5 ou servidor inválido.');
  const t=now();let link=await repo.portalByPortalId(portalId),created=false,userId=link?.user_id;
  if(!userId){
   const base=(email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g,'')||'aluno').slice(0,30);
   for(let i=0;i<5&&!userId;i++){
    const username=`${base}-${(i?randomBytes(3).toString('hex'):sha(portalId).slice(0,6))}`;
    const made=await repo.portalCreateUser({id:randomUUID(),username,name,now:t});if(made){userId=made.id;created=true;}
   }
   if(!userId)throw new HttpError(409,'Não foi possível criar o usuário.');
  }
  if(needsCopy&&account&&!await copy.agentForUser(userId)){
   if(await copyHooks.taken?.(account,server))throw new HttpError(409,'Esta conta MT5 já está vinculada a outro aluno.');
  }
  const prev=await repo.membershipOf(userId);
  const same=prev&&prev.plan_code===plan&&prev.status===b.status;
  if(!prev||!same)await repo.setMembership({id:userId,plan,status:b.status,accessUntil:until,now:t});
  else if(Number(prev.access_until)!==until)await repo.setMembershipSoft({id:userId,plan,status:b.status,accessUntil:until,now:t});
  await syncPlan({userId,plan,status:b.status,accessUntil:until,now:t});
  if(needsCopy&&account&&!await copy.agentForUser(userId))await copyHooks.create?.({userId,account,server,now:t});
  await repo.portalUpsert({userId,portalUserId:portalId,email,locale,tokai:b.is_tokai_student===true,billing,now:t});
  if(b.terms_version===TERMS_VERSION&&b.terms_accepted_at!==undefined){const at=Date.parse(b.terms_accepted_at);await repo.acceptTerms(userId,TERMS_VERSION,Number.isSafeInteger(at)&&at>0&&at<=t+60000?at:t);}
  return {portal_user_id:portalId,user_id:userId,created};
 }
 async function route(req,send){
  if(!enabled)return false;
  const url=req.url||'';const path=url.split('?')[0];
  if(req.method==='POST'&&path==='/v1/auth/sso'){await exchange(req,send);return true;}
  if(!path.startsWith('/v1/integration/'))return false;
  const ip=clientIp(req);limit('ip:'+ip,120,60000);
  const body=['PUT','POST'].includes(req.method)?await rawBody(req):Buffer.alloc(0);
  const ts=String(req.headers['x-timestamp']||''),sig=String(req.headers['x-signature']||'');
  const fail=()=>{limit('fail:'+ip,20,60000);throw new HttpError(401,'Assinatura inválida.');};
  if(req.headers['x-key-id']!==keyId||!/^\d{10}$/.test(ts)||!/^[0-9a-f]{64}$/.test(sig))fail();
  if(Math.abs(now()/1000-Number(ts))>300)fail();
  const want=signRequest(secret,{timestamp:ts,method:req.method,path:url,body});
  if(!timingSafeEqual(Buffer.from(want),Buffer.from(sig)))fail();
  if(allowedIps.length&&!allowedIps.includes(ip))throw new HttpError(403,'IP não autorizado.');
  limit('key:'+keyId,300,60000);
  const reply=async(status,data)=>{try{await repo.auditPut({id:randomUUID(),at:now(),keyId,method:req.method,path:url,status});}catch{}send(status,data);};
  const m=/^\/v1\/integration\/users(?:\/([^/]+)(\/sso)?)?$/.exec(path);
  if(!m)return await reply(404,{error:'Rota não encontrada.'}),true;
  const id=m[1]===undefined?null:pid(m[1]);
  if(m[1]!==undefined&&!id)return await reply(422,{error:'portal_user_id inválido.'}),true;
  if(now()%50===0)repo.integrationCleanup(now()).catch(()=>{});
  const idem=String(req.headers['idempotency-key']||'');
  const mutating=req.method==='PUT'||req.method==='POST';
  if(mutating&&!/^[A-Za-z0-9_.:-]{8,80}$/.test(idem))return await reply(400,{error:'Idempotency-Key obrigatório (8 a 80 caracteres).'}),true;
  const ikey=mutating?sha(`${keyId}|${req.method}|${url}|${sha(body)}|${idem}`):null;
  if(ikey){const hit=await repo.idemGet(ikey);if(hit)return await reply(hit.status,JSON.parse(hit.body)),true;}
  const done=async(status,data)=>{if(ikey&&status<500)await repo.idemPut(ikey,status,JSON.stringify(data),now());return await reply(status,data);};
  try{
   if(req.method==='PUT'&&id&&!m[2]){
    let b;try{b=JSON.parse(body.toString('utf8'));}catch{throw new HttpError(400,'JSON inválido.');}
    if(!b||typeof b!=='object'||Array.isArray(b))throw new HttpError(400,'JSON inválido.');
    return await done(200,await upsert(id,b)),true;
   }
   if(req.method==='POST'&&id&&m[2]){
    const d=await repo.portalDetail(id);if(!d)return await done(404,{error:'Aluno não encontrado.'}),true;
    const t=now();
    if(d.status!=='active'||d.membership_status!=='active'||(d.access_until!==null&&Number(d.access_until)<=t))return await done(409,{error:'Aluno sem acesso ativo.'}),true;
    const ticket=randomBytes(32).toString('base64url'),expires=t+60000;
    await repo.ssoCreate({hash:sha(ticket),userId:d.id,expires});
    return await done(200,{url:`${appUrl.replace(/\/$/,'')}/#sso=${ticket}`,expires_at:expires}),true;
   }
   if(req.method==='GET'&&id&&!m[2]){
    const d=await repo.portalDetail(id);if(!d)return await reply(404,{error:'Aluno não encontrado.'}),true;
    const a=await copy.agentForUser(d.id);
    return await reply(200,{portal_user_id:id,user_id:d.id,username:d.username,name:d.display_name,email:d.email,locale:d.locale,user_status:d.status,plan:d.plan_code,membership_status:d.membership_status,access_until:d.access_until===null?null:new Date(Number(d.access_until)).toISOString(),is_tokai_student:!!d.is_tokai_student,billing_state:d.billing_state,terms_accepted_at:d.terms_accepted_at?new Date(Number(d.terms_accepted_at)).toISOString():null,copy:a?{status:a.status,mt5_account:a.expected_account,broker_server:a.broker_server,last_seen_at:a.last_seen_at===null||a.last_seen_at===undefined?null:new Date(Number(a.last_seen_at)).toISOString()}:null}),true;
   }
   if(req.method==='GET'&&!id&&m[1]===undefined){
    const q=new URL(url,'http://x').searchParams,since=Number(q.get('updated_since')||0),lim=Math.min(Math.max(Number(q.get('limit')||200),1),500);
    if(!Number.isFinite(since)||since<0)throw new HttpError(422,'updated_since inválido (milissegundos).');
    const rows=await repo.portalList(since,lim);
    return await reply(200,{users:rows.map(r=>({portal_user_id:r.portal_user_id,user_id:r.id,user_status:r.status,plan:r.plan_code,membership_status:r.membership_status,access_until:r.access_until===null?null:new Date(Number(r.access_until)).toISOString(),is_tokai_student:!!r.is_tokai_student,billing_state:r.billing_state,updated_at:Number(r.updated_at)})),next_updated_since:rows.length?Number(rows[rows.length-1].updated_at):since}),true;
   }
   return await reply(405,{error:'Método não permitido.'}),true;
  }catch(e){
   if(e instanceof HttpError&&e.status<500){return await reply(e.status,{error:e.message}),true;}
   throw e;
  }
 }
 return {enabled,route};
}
