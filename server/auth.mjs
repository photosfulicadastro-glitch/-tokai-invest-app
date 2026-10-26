import {randomBytes,randomUUID,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
const digest=s=>createHash('sha256').update(s).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const publicUser=u=>({id:u.id,username:u.username,name:u.display_name,role:'reader'});
export class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
export async function readJson(req,limit=8192){
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>limit)throw new HttpError(413,'Solicitação muito grande.');chunks.push(chunk);}
 const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
 if(!body||Array.isArray(body)||typeof body!=='object')throw new HttpError(400,'Dados inválidos.');return body;
}
async function passwordHash(password,salt=randomBytes(16).toString('hex')){
 const hash=await scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:64*1024*1024});
 return `scrypt$${salt}$${hash.toString('hex')}`;
}
async function matches(password,stored){
 const [,salt,expected]=(stored||'scrypt$00000000000000000000000000000000$'+'0'.repeat(64)).split('$');
 const got=(await passwordHash(password,salt)).split('$')[2];
 return typeof stored==='string'&&timingSafeEqual(Buffer.from(got,'hex'),Buffer.from(expected,'hex'));
}
export function createAuth(repo,now=()=>Date.now()){
 const attempts=new Map();let inFlight=0,lastCleanup=0;
 function throttle(key,max,ms){
  const time=now();for(const [k,v] of attempts)if(v.until<=time)attempts.delete(k);
  if(attempts.size>2000)throw new HttpError(429,'Muitas tentativas. Aguarde alguns minutos.');
  const entry=attempts.get(key)||{count:0,until:time+ms};entry.count++;attempts.set(key,entry);
  if(entry.count>max)throw new HttpError(429,'Muitas tentativas. Aguarde alguns minutos.');
 }
 async function expensive(fn){if(inFlight>=2)throw new HttpError(429,'Servidor ocupado. Tente novamente em instantes.');inFlight++;try{return await fn();}finally{inFlight--;}}
 async function session(user){const value=secret(),expires=now()+12*60*60*1000;if(!await repo.session(digest(value),user,expires))throw new HttpError(401,'Acesso indisponível. Entre novamente.');return {token:value,expires_at:expires,user:publicUser(user)};}
 return {
  async resolve(token){if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;const user=await repo.resolve(digest(token),now());return user?publicUser(user):null;},
  async route(req,send,isAdmin,token){
   if(!req.url.startsWith('/v1/auth/')&&!req.url.startsWith('/v1/admin/'))return false;
   if(req.url.startsWith('/v1/admin/')&&!isAdmin)throw new HttpError(403,'Acesso administrativo necessário.');
   if(now()-lastCleanup>3600000){lastCleanup=now();await repo.cleanup(now());}
   if(req.method==='POST'&&req.url==='/v1/auth/login'){
    throttle('global-login',100,60000);const b=await readJson(req);
    const username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
    if(!/^[a-z0-9._-]{3,48}$/.test(username)||typeof b.password!=='string'||b.password.length>128)throw new HttpError(401,'Usuário ou senha inválidos.');
    throttle('login:'+username,8,15*60000);
    const u=await repo.find(username);const ok=await expensive(()=>matches(b.password,u?.password_hash));
    if(!ok||u.status!=='active')throw new HttpError(401,'Usuário ou senha inválidos.');
    attempts.delete('login:'+username);send(200,await session(u));return true;
   }
   if(req.method==='POST'&&req.url==='/v1/auth/activate'){
    throttle('global-activate',30,60000);const b=await readJson(req);
    if(typeof b.invite!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(b.invite))throw new HttpError(400,'Convite inválido, utilizado ou expirado.');
    if(typeof b.password!=='string'||b.password.length<12||b.password.length>128)throw new HttpError(400,'Use uma senha com 12 a 128 caracteres.');
    const hash=digest(b.invite);if(!await repo.invite(hash))throw new HttpError(400,'Convite inválido, utilizado ou expirado.');
    const password=await expensive(()=>passwordHash(b.password));const u=await repo.redeem(hash,password,now());
    if(!u)throw new HttpError(400,'Convite inválido, utilizado ou expirado.');send(200,await session(u));return true;
   }
   if(req.method==='POST'&&req.url==='/v1/auth/logout'){await repo.logout(digest(token));send(200,{ok:true});return true;}
   if(req.method==='GET'&&req.url==='/v1/admin/users'){send(200,{users:await repo.list()});return true;}
   if(req.method==='POST'&&req.url==='/v1/admin/invites'){
    const b=await readJson(req);const username=typeof b.username==='string'?b.username.trim().toLowerCase():'';
    const name=typeof b.name==='string'?b.name.trim():'';
    if(!/^[a-z0-9._-]{3,48}$/.test(username)||!name||name.length>80)throw new HttpError(400,'Informe nome (até 80 caracteres) e usuário (3 a 48 letras, números, ponto, hífen ou sublinhado).');
    const invite=secret(),expires=now()+72*3600000;
    const result=await repo.create({id:randomUUID(),username,name,hash:digest(invite),expires,now:now()});
    if(!result)throw new HttpError(409,'Esse nome de usuário já está cadastrado.');
    send(201,{invite,expires_at:expires,username});return true;
   }
   if(req.method==='POST'&&req.url==='/v1/admin/access'){
    const b=await readJson(req);if(typeof b.id!=='string'||!['block','enable','reset'].includes(b.action))throw new HttpError(400,'Ação inválida.');
    if(b.action==='reset'){
     const invite=secret(),expires=now()+72*3600000;const u=await repo.reset(b.id,digest(invite),expires);
     if(!u)throw new HttpError(404,'Usuário não encontrado.');send(200,{invite,expires_at:expires,username:u.username});return true;
    }
    if(!await repo.change(b.id,b.action==='block'?'blocked':'active'))throw new HttpError(400,'Ative o convite antes de alterar o acesso.');
    send(200,{ok:true});return true;
   }
   throw new HttpError(404,'Rota não encontrada.');
  }
 };
}
