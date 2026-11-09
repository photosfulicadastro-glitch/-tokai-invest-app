import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApi} from '../server/server.mjs';
import {sqliteStore} from '../server/storage.mjs';
const TERMS='signals-copy-risk-v2',PASSWORD='Senha9!xy';
async function setup(opts={}){
 const dir=mkdtempSync(join(tmpdir(),'tokai-audit-')),storage=sqliteStore(join(dir,'a.sqlite')),admin='a'.repeat(40),ingest='i'.repeat(40);
 const server=createApi({storage,viewerToken:admin,ingestToken:ingest,origin:'https://sinais.tokaiinvest.jp',...opts});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const rq=async(path,token='',body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const ct=r.headers.get('content-type')||'';return {s:r.status,d:ct.includes('json')?await r.json():Buffer.from(await r.arrayBuffer())};};
 const member=async(username,plan,account)=>{
  const inv=(await rq('/v1/admin/invites',admin,{username,name:username,plan})).d;
  const act=await rq('/v1/auth/activate','',{invite:inv.invite,password:PASSWORD,terms_accepted:true,terms_version:TERMS});
  const user=await storage.auth.find(username);let agent=null,created=null;
  if(account){created=await rq('/v1/admin/copy/agents',admin,{user_id:user.id,expected_account:account,broker_server:'Exness-MT5Trial3',daily_loss_percent:10});agent=created.d.agent;}
  return {token:act.d.token,user,agent,created};
 };
 const close=async()=>{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true});};
 return {rq,admin,ingest,member,storage,close,base};
}
const licenseFrom=zip=>zip.toString('latin1').match(/License=([A-Za-z0-9_-]{43})/)[1];

test('aluno bloqueado perde o Copy no EA e recupera ao liberar',async()=>{
 const {rq,admin,ingest,member,close}=await setup();
 try{
  await rq('/v1/snapshot',ingest,{source:'principal',observed_at:Math.floor(Date.now()/1000),symbol:'XAUUSD',currency:'USD',bid:1,ask:1,positions:[],deals:[]});
  await rq('/v1/admin/copy/settings',admin,{execution_mode:'both',max_daily_loss_percent:10});
  const a=await member('aluno.a','copy','11111111');
  assert.equal((await rq('/v1/copy/installer',a.token,{})).s,403);
  assert.equal((await rq('/v1/admin/copy/links',admin,{agent_id:a.agent.id})).s,201);
  const zip=await rq('/v1/copy/installer',a.token,{});assert.equal(zip.s,200);
  const body={license:licenseFrom(zip.d),account:'11111111',server:'Exness-MT5Trial3',fingerprint:'fp-AAAAAAAAAAAAAAAA'};
  assert.equal((await rq('/v1/copy/activate','',body)).s,200);
  assert.equal((await rq('/v1/copy/plan','',{...body,equity:1000})).s,200);
  await rq('/v1/admin/access',admin,{id:a.user.id,action:'block'});
  const exit=await rq('/v1/copy/plan','',{...body,equity:1000});assert.equal(exit.s,200);assert.equal(exit.d.exit_only,true);assert.equal(exit.d.close_all,false);
  assert.equal((await rq('/v1/copy/plan','',{...body,fingerprint:'fp-OUTRAOUTRAOUTRA1',equity:1000})).s,403);
  assert.equal((await rq('/v1/admin/copy/close-all',admin,{user_id:a.user.id})).s,200);
  assert.equal((await rq('/v1/copy/plan','',{...body,equity:1000})).d.close_all,true);
  assert.equal((await rq('/v1/copy/report','',{...body,equity:1000,event_type:'status',message:'x'})).s,403);
  await rq('/v1/admin/access',admin,{id:a.user.id,action:'enable'});
  const back=await rq('/v1/copy/plan','',{...body,equity:1000});assert.equal(back.s,200);assert.equal(back.d.exit_only,false);assert.equal(back.d.close_all,false);
  await rq('/v1/admin/access',admin,{id:a.user.id,action:'block'});
  assert.equal((await rq('/v1/copy/plan','',{...body,equity:1000})).d.close_all,false);
 }finally{await close();}
});

test('plano Copy não acessa /v1/state; Sinais e Sinais+Copy acessam',async()=>{
 const {rq,member,close}=await setup();
 try{
  const copy=await member('so.copy','copy','22222222'),sig=await member('so.sinais','signals'),both=await member('ambos','signals_copy','33333333');
  assert.equal((await rq('/v1/state',copy.token)).s,403);
  assert.equal((await rq('/v1/state',sig.token)).s,200);
  assert.equal((await rq('/v1/state',both.token)).s,200);
 }finally{await close();}
});

test('a mesma conta MT5 não pode ser vinculada a dois alunos',async()=>{
 const {member,close}=await setup();
 try{
  const a=await member('aluno.a','copy','44444444');assert.equal(a.created.s,201);
  const b=await member('aluno.b','copy','44444444');assert.equal(b.created.s,409);
 }finally{await close();}
});

test('cadastro com plano de pagamento pré-cria o agente Copy e a aprovação libera tudo', async()=>{
 const {rq,admin,storage,close}=await setup();
 try{
  const base={name:'Aluno Pago',username:'aluno.pago',password:PASSWORD,plan:'signals_copy',mt5_account:'41277716',broker_server:'Exness-MT5Trial3',terms_accepted:true,terms_version:TERMS};
  assert.equal((await rq('/v1/auth/register','',{...base,payment_plan:'bogus'})).s,400);
  assert.equal((await rq('/v1/auth/register','',{...base,payment_plan:'quarterly'})).s,202);
  assert.equal((await rq('/v1/auth/register','',{...base,username:'outro.aluno',payment_plan:'monthly'})).s,409);
  const user=await storage.auth.find('aluno.pago');
  const listed=(await rq('/v1/admin/users',admin)).d.users.find(u=>u.id===user.id);
  assert.equal(listed.payment_plan,'quarterly');assert.equal(listed.status,'pending');
  const agents=(await rq('/v1/admin/copy/overview',admin)).d;
  const row=(agents.agents||agents.students||[]).find(x=>x.user?.id===user.id);
  assert.equal(Number(row.agent.daily_loss_percent),10);assert.equal(row.agent.expected_account,'41277716');
  assert.equal((await rq('/v1/auth/login','',{username:'aluno.pago',password:PASSWORD})).s,401);
  const ok=await rq('/v1/admin/approve',admin,{id:user.id});assert.equal(ok.s,200);
  const days=(ok.d.access_until-Date.now())/864e5;assert.ok(days>89&&days<91.1);
  assert.equal((await rq('/v1/auth/login','',{username:'aluno.pago',password:PASSWORD})).s,200);
  assert.equal((await rq('/v1/admin/approve',admin,{id:user.id})).s,409);
 }finally{await close();}
});

test('teste grátis de 7 dias libera por 7 dias na aprovação',async()=>{
 const {rq,admin,storage,close}=await setup();
 try{
  assert.equal((await rq('/v1/auth/register','',{name:'Aluno Teste',username:'aluno.teste',password:PASSWORD,plan:'signals',payment_plan:'trial',terms_accepted:true,terms_version:TERMS})).s,202);
  const user=await storage.auth.find('aluno.teste');
  const ok=await rq('/v1/admin/approve',admin,{id:user.id});assert.equal(ok.s,200);
  const days=(ok.d.access_until-Date.now())/864e5;assert.ok(days>6&&days<8.1);
 }finally{await close();}
});

test('chave de monitor por computador envia snapshot e pode ser revogada',async()=>{
 const {rq,admin,close}=await setup();
 try{
  const snap=()=>({source:'principal',observed_at:Math.floor(Date.now()/1000),symbol:'XAUUSD',currency:'USD',bid:1,ask:1,positions:[],deals:[]});
  assert.equal((await rq('/v1/snapshot','x'.repeat(43),snap())).s,401);
  const made=await rq('/v1/admin/monitors',admin,{name:'Professor 1'});assert.equal(made.s,201);
  assert.equal((await rq('/v1/snapshot',made.d.key,snap())).s,200);
  const list=(await rq('/v1/admin/monitors',admin)).d.monitors;assert.equal(list.length,1);assert.ok(list[0].last_seen_at);
  assert.equal((await rq('/v1/admin/monitors/revoke',admin,{id:made.d.monitor.id})).s,200);
  assert.equal((await rq('/v1/snapshot',made.d.key,snap())).s,401);
  assert.equal((await rq('/v1/admin/monitors','',{name:'x'})).s,403);
 }finally{await close();}
});

test('pacote do monitor valida entrada, exige admin e gera chave que funciona',async()=>{
 const {rq,admin,close}=await setup();
 try{
  const {existsSync}=await import('node:fs');
  const hasEx5=existsSync(new URL('../mt5/TokaiMonitor.ex5',import.meta.url));
  assert.equal((await rq('/v1/admin/monitors/package','',{name:'P1',account:'123456'})).s,403);
  assert.equal((await rq('/v1/admin/monitors/package',admin,{name:'',account:'123456'})).s,400);
  assert.equal((await rq('/v1/admin/monitors/package',admin,{name:'P1',account:'abc'})).s,400);
  const r=await rq('/v1/admin/monitors/package',admin,{name:'Professor 1',account:'123456'});
  if(!hasEx5){assert.equal(r.s,503);assert.equal((await rq('/v1/admin/monitors',admin)).d.monitors.length,0);}
  else{assert.equal(r.s,200);assert.equal((await rq('/v1/admin/monitors',admin)).d.monitors.length,1);}
 }finally{await close();}
});

test('operações ficam marcadas com o computador que as enviou primeiro',async()=>{
 const {rq,admin,ingest,close}=await setup();
 try{
  const deal=(id,time)=>({id,position_id:id,side:'BUY',entry:1,time,volume:0.01,price:1,profit:1,commission:0,swap:0,fee:0});
  const snap=deals=>({source:'principal',observed_at:Math.floor(Date.now()/1000),symbol:'XAUUSD',currency:'USD',bid:1,ask:1,positions:[],deals});
  const t=Math.floor(Date.now()/1000)-100;
  const a=(await rq('/v1/admin/monitors',admin,{name:'FULI – FUKUROI'})).d.key,b=(await rq('/v1/admin/monitors',admin,{name:'ROBERTO – MIE'})).d.key;
  assert.equal((await rq('/v1/snapshot',ingest,snap([deal('1',t-50)]))).s,200);
  assert.equal((await rq('/v1/snapshot',a,snap([deal('2',t-40)]))).s,200);
  // Roberto liga depois e reenvia o histórico (inclui a operação do Fuli) mais uma nova dele
  assert.equal((await rq('/v1/snapshot',b,snap([deal('1',t-50),deal('2',t-40),deal('3',t-10)]))).s,200);
  const st=(await rq('/v1/state',admin)).d;
  const by=Object.fromEntries(st.deals.map(d=>[d.id,d.operator?.name??null]));
  assert.equal(by['1'],null);
  assert.equal(by['2'],'FULI – FUKUROI');
  assert.equal(by['3'],'ROBERTO – MIE');
  assert.equal(st.state.operator.name,'ROBERTO – MIE');
 }finally{await close();}
});

test('conta-mãe padrão do servidor dispensa o login no pacote',async()=>{
 const {rq,admin,close}=await setup({masterAccount:'41277672'});
 try{
  const {existsSync}=await import('node:fs');
  assert.equal((await rq('/v1/admin/monitors',admin)).d.master_account,'41277672');
  const r=await rq('/v1/admin/monitors/package',admin,{name:'P1'});
  assert.equal(r.s,existsSync(new URL('../mt5/TokaiMonitor.ex5',import.meta.url))?200:503);
 }finally{await close();}
});

test('novo pacote do mesmo computador revoga o anterior e a lista de nomes vem do servidor',async()=>{
 const {rq,admin,close}=await setup({masterAccount:'41277672',teamNames:['ROBERTO – MIE','FULI – FUKUROI']});
 try{
  const {existsSync}=await import('node:fs');
  assert.deepEqual((await rq('/v1/admin/monitors',admin)).d.team_names,['ROBERTO – MIE','FULI – FUKUROI']);
  if(!existsSync(new URL('../mt5/TokaiMonitor.ex5',import.meta.url)))return;
  assert.equal((await rq('/v1/admin/monitors/package',admin,{name:'ROBERTO – MIE'})).s,200);
  assert.equal((await rq('/v1/admin/monitors/package',admin,{name:'ROBERTO – MIE'})).s,200);
  const list=(await rq('/v1/admin/monitors',admin)).d.monitors;
  assert.equal(list.length,2);assert.equal(list.filter(m=>!m.revoked_at).length,1);
 }finally{await close();}
});

test('link de download do monitor é de uso único, expira e não precisa de login',async()=>{
 const {existsSync}=await import('node:fs');
 let t=Date.now();
 const {rq,admin,close,base}=await setup({masterAccount:'41277672',now:()=>t});
 try{
  assert.equal((await rq('/v1/admin/monitors/link','',{name:'P1'})).s,403);
  assert.equal((await rq('/v1/admin/monitors/link',admin,{name:''})).s,400);
  const made=await rq('/v1/admin/monitors/link',admin,{name:'EDU – SUZUKA'});assert.equal(made.s,201);
  const path=new URL(made.d.url).pathname.replace(/^\/api/,'');
  // pré-visualização (GET) não consome
  const g1=await fetch(base+path);assert.equal(g1.status,200);assert.match(await g1.text(),/Baixar pacote do monitor/);
  const g2=await fetch(base+path);assert.equal(g2.status,200);
  if(existsSync(new URL('../mt5/TokaiMonitor.ex5',import.meta.url))){
   const p1=await fetch(base+path,{method:'POST'});assert.equal(p1.status,200);assert.equal(p1.headers.get('content-type'),'application/zip');
   const p2=await fetch(base+path,{method:'POST'});assert.equal(p2.status,410);
   const list=(await rq('/v1/admin/monitors',admin)).d.monitors;assert.equal(list.filter(m=>m.name==='EDU – SUZUKA'&&!m.revoked_at).length,1);
  }
  // expirado
  const made2=await rq('/v1/admin/monitors/link',admin,{name:'MARCOS – NAGANO'});const path2=new URL(made2.d.url).pathname.replace(/^\/api/,'');
  t+=25*60*60*1000;
  assert.equal((await fetch(base+path2)).status,410);
  assert.equal((await fetch(base+path2,{method:'POST'})).status,410);
  assert.equal((await fetch(base+'/v1/monitor/download/'+'x'.repeat(43))).status,410);
 }finally{await close();}
});

test('snapshot com horário da corretora (monitor 1.30) é aceito e guardado',async()=>{
 const {rq,admin,ingest,close}=await setup();
 try{
  const t=Math.floor(Date.now()/1000);
  assert.equal((await rq('/v1/snapshot',ingest,{source:'principal',observed_at:t,broker_time:t+10800,symbol:'XAUUSD',currency:'USD',bid:1,ask:1,positions:[],deals:[]})).s,200);
  assert.equal((await rq('/v1/state',admin)).d.state.broker_time,t+10800);
 }finally{await close();}
});
test('link do pacote Copy: uso único, 24h, não mexe no login e a licença antiga deixa de valer',async()=>{
 let t=Date.now();
 const {rq,admin,member,close,base}=await setup({now:()=>t});
 try{
  await rq('/v1/admin/copy/settings',admin,{execution_mode:'both',max_daily_loss_percent:10});
  const a=await member('aluno.link','copy','22222222');
  assert.equal((await rq('/v1/admin/copy/links',a.token,{agent_id:a.agent.id})).s,403);
  assert.equal((await rq('/v1/admin/copy/links',admin,{agent_id:'nao-existe'})).s,404);
  const made=await rq('/v1/admin/copy/links',admin,{agent_id:a.agent.id});assert.equal(made.s,201);
  const path=new URL(made.d.url).pathname.replace(/^\/api/,'');
  const g1=await fetch(base+path);assert.equal(g1.status,200);assert.match(await g1.text(),/Baixar pacote do Copy/);
  assert.equal((await fetch(base+path)).status,200);
  const p1=await fetch(base+path,{method:'POST'});assert.equal(p1.status,200);assert.equal(p1.headers.get('content-type'),'application/zip');
  const zip1=Buffer.from(await p1.arrayBuffer());
  assert.equal((await fetch(base+path,{method:'POST'})).status,410);
  const body1={license:licenseFrom(zip1),account:'22222222',server:'Exness-MT5Trial3',fingerprint:'fp-AAAAAAAAAAAAAAAA'};
  assert.equal((await rq('/v1/copy/activate','',body1)).s,200);
  // o login do aluno continua funcionando (senha e sessão intactas)
  assert.equal((await rq('/v1/auth/login','',{username:'aluno.link',password:PASSWORD})).s,200);
  assert.equal((await rq('/v1/copy/me',a.token)).s,200);
  // novo link = nova licença; a anterior é revogada
  const made2=await rq('/v1/admin/copy/links',admin,{agent_id:a.agent.id});const path2=new URL(made2.d.url).pathname.replace(/^\/api/,'');
  const p2=await fetch(base+path2,{method:'POST'});assert.equal(p2.status,200);const zip2=Buffer.from(await p2.arrayBuffer());
  assert.notEqual(licenseFrom(zip2),licenseFrom(zip1));
  assert.notEqual((await rq('/v1/copy/plan','',{...body1,equity:1000})).s,200);
  // expirado
  const made3=await rq('/v1/admin/copy/links',admin,{agent_id:a.agent.id});const path3=new URL(made3.d.url).pathname.replace(/^\/api/,'');
  t+=25*60*60*1000;
  assert.equal((await fetch(base+path3)).status,410);
  assert.equal((await fetch(base+path3,{method:'POST'})).status,410);
 }finally{await close();}
});
