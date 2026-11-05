'use strict';
const root=document.getElementById('root');
let page='home',token='',data=null,error='',busy=false,tf='M5';
let nav=[];
let followCandles=true,chartScrollLeft=0,lastCandleStale=false,chartZoom=1,chartYScale=1,chartYPan=0,chartExpanded=false;
const readerNav=[['home','⌂','Visão geral'],['market','▥','Mercado'],['trades','▤','Operações'],['history','◷','Histórico']];
let identity=null,authMode='reader',authBusy=false,adminUsers=[],adminMessage='',inviteResult=null;
let inviteCode=new URLSearchParams(location.hash.slice(1)).get('convite')||'';
if(inviteCode)window.history.replaceState(null,'',location.pathname+location.search);
try{token=sessionStorage.getItem('tokai.session')||'';}catch{}
function updateNav(){nav=identity?.role==='admin'?[...readerNav,['users','♙','Acessos'],['connect','⇄','Conexão MT5']]:readerNav;}
updateNav();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const planName=p=>p==='premium'?'Premium':p==='signals'?'Sinais':'Teste legado';
const dateValue=v=>{const t=Number(v);return Number.isFinite(t)&&t>0?new Date(t).toISOString().slice(0,10):'';};
const defaultMembershipDate=()=>dateValue(Date.now()+30*24*3600000);
const membershipControls=u=>{const plan=u.plan_code==='premium'?'premium':'signals',state=u.membership_status==='paused'?'paused':'active',until=dateValue(u.access_until);return `<div class="membership-controls"><select id="member-plan-${esc(u.id)}" aria-label="Plano de ${esc(u.display_name)}"><option value="signals" selected>Sinais</option></select><select id="member-status-${esc(u.id)}" aria-label="Situação da mensalidade de ${esc(u.display_name)}"><option value="active" ${state==='active'?'selected':''}>Liberado</option><option value="paused" ${state==='paused'?'selected':''}>Pausado</option></select><input id="member-until-${esc(u.id)}" type="date" value="${until}" aria-label="Acesso até"><button class="btn" data-membership-save="${esc(u.id)}">Salvar</button><small>${u.plan_code?until?'Acesso até '+until:'Sem vencimento definido':'Acesso legado; defina o plano ao renovar.'}</small></div>`;};
const num=v=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:5});
const side=s=>s==='BUY'?'COMPRA':'VENDA';
const metric=(t,v,s)=>`<section class="card"><h3>${t}</h3><div class="metric">${v}</div><div class="sub">${s}</div></section>`;
const empty=t=>`<div class="empty">${t}</div>`;
async function api(path,body,access=token){
 const configured=location.hostname==='sinais.tokaiinvest.jp'?'/api':(window.TOKAI_API_URL||'/api');
 const base=new URL(configured,window.location.origin);
 if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Servidor precisa usar HTTPS.');
 const url=base.href.replace(/\/$/,'')+path;
 const result=await new Promise((resolve,reject)=>{
  const req=new XMLHttpRequest();req.open(body===undefined?'GET':'POST',url,true);req.timeout=15000;req.setRequestHeader('Content-Type','application/json');if(access)req.setRequestHeader('Authorization','Bearer '+access);
  req.onload=()=>{let payload={};try{payload=JSON.parse(req.responseText||'{}');}catch{reject(Error('Resposta inválida do servidor.'));return;}if(req.status<200||req.status>=300){const err=Error(payload.error||'Não foi possível concluir.');err.status=req.status;reject(err);return;}resolve(payload);};
  req.onerror=()=>reject(Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'));
  req.ontimeout=()=>reject(Error('O servidor demorou para responder. Tente novamente.'));
  req.send(body===undefined?null:JSON.stringify(body));
 });
 return result;
}
function remember(){try{if(identity?.role==='reader')sessionStorage.setItem('tokai.session',token);else sessionStorage.removeItem('tokai.session');}catch{}}
function clearAccess(){token='';identity=null;data=null;page='home';followCandles=true;chartScrollLeft=0;adminUsers=[];inviteResult=null;adminMessage='';remember();updateNav();}
async function logout(){try{await window.tokaiPush?.disable(api);}catch{}const previous=token;clearAccess();error='';login();try{await api('/v1/auth/logout',{},previous);}catch{}}
function login(){
 const activating=!!inviteCode,admin=authMode==='admin'&&!activating;
 root.innerHTML=`<div class="loginwrap"><section class="loginbox"><img class="login-logo-img" src="marca-tokai-invest.jpeg" alt="TOKAI INVEST"><h1>${activating?'Ativar acesso':'TOKAI INVEST'}</h1><p class="sub">${activating?'Crie sua senha para acompanhar os sinais.':admin?'Acesso exclusivo do administrador.':'Entre para acompanhar os sinais de XAUUSD.'}</p>${error?`<p role="alert">${esc(error)}</p>`:''}<form id="login">${activating?'':admin?'<div class="field"><label for="key">Senha administrativa ou chave inicial</label><input id="key" type="password" required autocomplete="current-password"></div>':'<div class="field"><label for="username">Nome de usuário</label><input id="username" required autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="48"></div>'}${admin?'':`<div class="field"><label for="password">${activating?'Crie uma senha (exatamente 9 caracteres)':'Senha'}</label><input id="password" type="password" required ${activating?'minlength="9" maxlength="9"':'maxlength="128"'} autocomplete="${activating?'new-password':'current-password'}"></div>${activating?'<div class="field"><label for="repeat">Repita a senha</label><input id="repeat" type="password" required minlength="9" maxlength="9" autocomplete="new-password"></div>':''}`}<button class="btn goldbtn full" ${authBusy?'disabled':''}>${activating?'Ativar meu acesso':'Entrar'}</button></form><p class="sub">${activating?'Seu convite é pessoal e só pode ser utilizado uma vez.':'Acesso mediante convite da Tokai Invest. Para recuperar sua senha, solicite um novo convite ao responsável.'}</p><button class="btn full" id="auth-mode">${activating?'Voltar ao login':admin?'Entrar como usuário':'Acesso administrativo'}</button></section></div>`;
 document.getElementById('auth-mode').onclick=()=>{inviteCode='';authMode=admin?'reader':'admin';if(activating)authMode='reader';error='';login();};
 document.getElementById('login').addEventListener('submit',async e=>{
  e.preventDefault();if(authBusy)return;authBusy=true;e.target.querySelector('button').disabled=true;
  try{
   if(admin){const key=document.getElementById('key').value;const result=await api('/v1/auth/admin-login',{password:key},'');token=result.token;identity=result.user;}
   else{
    const password=document.getElementById('password').value;
    if(activating&&password!==document.getElementById('repeat').value)throw Error('As senhas não coincidem.');
    const result=await api(activating?'/v1/auth/activate':'/v1/auth/login',activating?{invite:inviteCode,password}:{username:document.getElementById('username').value,password},'');
    token=result.token;identity=result.user;inviteCode='';
   }
   remember();updateNav();error='';page='home';await window.tokaiPush?.restore(api).catch(()=>{});await refresh();
  }catch(e){error=e.message;login();}finally{authBusy=false;const button=document.querySelector('#login button');if(button)button.disabled=false;}
 });
}
function invitePanel(){if(!inviteResult)return '';const url=new URL(location.pathname,location.origin);url.hash='convite='+inviteResult.invite;return `<section class="card" style="margin-bottom:14px"><h3>Convite criado: ${esc(inviteResult.username)}</h3><p>Copie este link e envie individualmente. Ele aparece apenas nesta sessão, vale 72 horas e permite criar a senha uma única vez.</p><div class="field"><label for="invite-link">Link individual</label><input id="invite-link" readonly value="${esc(url.href)}"></div><button class="btn" id="copy-invite">Copiar link</button><p class="sub">Não publique o link em grupos. Guarde o nome de usuário para informar à pessoa.</p></section>`;}
function usersPage(){return heading('Acessos aos sinais','Libere convites individuais e gerencie o acesso de leitura.')+card('Sua senha administrativa','<form id="admin-password-form"><p class="sub">Crie uma senha administrativa com exatamente 9 caracteres. A chave inicial continua disponível para recuperação.</p><div class="field"><label for="admin-current">Senha atual (deixe vazio se entrou com a chave inicial)</label><input id="admin-current" type="password" autocomplete="current-password" maxlength="128"></div><div class="field"><label for="admin-new">Nova senha administrativa</label><input id="admin-new" type="password" autocomplete="new-password" minlength="9" maxlength="9" required></div><div class="field"><label for="admin-repeat">Repita a nova senha</label><input id="admin-repeat" type="password" autocomplete="new-password" required></div><button class="btn">Salvar senha administrativa</button></form>')+(adminMessage?`<div class="alert" role="status">${esc(adminMessage)}</div>`:'')+invitePanel()+`<div class="grid g2">${card('Convidar usuário','<form id="invite-form"><div class="field"><label for="invite-name">Nome</label><input id="invite-name" required maxlength="80"></div><div class="field"><label for="invite-user">Nome de usuário</label><input id="invite-user" required minlength="3" maxlength="48" pattern="[a-zA-Z0-9._-]{3,48}" autocapitalize="none" placeholder="Ex.: maria.silva"></div><div class="field"><label for="invite-plan">Plano</label><select id="invite-plan"><option value="signals">Sinais</option></select></div><div class="field"><label for="invite-until">Acesso até</label><input id="invite-until" type="date" required value="${defaultMembershipDate()}"></div><button class="btn goldbtn full">Gerar convite</button></form><p class="sub">Ao gerar o convite, o aluno fica liberado até a data informada. O pagamento é confirmado manualmente nesta primeira etapa.</p>')}${card('Usuários liberados',adminUsers.length?`<div class="tablewrap"><table class="table"><thead><tr><th>USUÁRIO</th><th>STATUS</th><th>PLANO / MENSALIDADE</th><th>AÇÕES</th></tr></thead><tbody>${adminUsers.map(u=>`<tr><td>${esc(u.display_name)}<br><small>${esc(u.username)}</small></td><td>${{active:'Ativo',blocked:'Bloqueado',invited:'Convite pendente'}[u.status]||'—'}</td><td>${membershipControls(u)}</td><td>${true?`<button class="btn" data-user="${esc(u.id)}" data-action="${u.status==='blocked'?'enable':'block'}">${u.status==='blocked'?'Liberar':'Bloquear'}</button>`:''}<button class="btn" data-user="${esc(u.id)}" data-action="reset">Novo convite</button><button class="btn" data-user="${esc(u.id)}" data-action="delete">Excluir</button></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhum usuário cadastrado.'))}</div><p class="sub">Bloquear encerra o acesso nas próximas consultas. Novo convite invalida a senha anterior e encerra as sessões desse usuário.</p>`;}
async function loadUsers(){try{adminUsers=(await api('/v1/admin/users')).users;if(page==='users')render();}catch(e){adminMessage=e.message;if(page==='users')render();}}
function bindAdmin(){
 document.getElementById('admin-password-form')?.addEventListener('submit',async e=>{e.preventDefault();const password=document.getElementById('admin-new').value;if(password!==document.getElementById('admin-repeat').value){adminMessage='As senhas não coincidem.';render();return;}e.target.querySelector('button').disabled=true;try{await api('/v1/admin/password',{password,current:document.getElementById('admin-current').value});clearAccess();authMode='admin';error='Senha salva. Entre com sua nova senha administrativa.';login();}catch(e){adminMessage=e.message;render();}});

 document.getElementById('copy-invite')?.addEventListener('click',async()=>{const field=document.getElementById('invite-link');try{await navigator.clipboard.writeText(field.value);document.getElementById('copy-invite').textContent='Copiado';}catch{field.select();}});
 document.getElementById('invite-form')?.addEventListener('submit',async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{inviteResult=await api('/v1/admin/invites',{name:document.getElementById('invite-name').value,username:document.getElementById('invite-user').value,plan:document.getElementById('invite-plan').value,access_until:document.getElementById('invite-until').value});adminMessage='Convite pronto para enviar individualmente.';await loadUsers();}catch(e){adminMessage=e.message;render();}});
 document.querySelectorAll('[data-membership-save]').forEach(b=>b.onclick=async()=>{
  b.disabled=true;const id=b.dataset.membershipSave;
  try{await api('/v1/admin/memberships',{id,plan:document.getElementById('member-plan-'+id).value,status:document.getElementById('member-status-'+id).value,access_until:document.getElementById('member-until-'+id).value});adminMessage='Mensalidade atualizada. O aluno precisará entrar novamente.';await loadUsers();}catch(e){adminMessage=e.message;render();}
 });
 document.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{
  if(b.dataset.action==='delete'&&!window.confirm('Excluir definitivamente este usuário e encerrar seu acesso e notificações?'))return;
  if(b.dataset.action==='reset'&&!window.confirm('Gerar novo convite e invalidar a senha e as sessões atuais deste usuário?'))return;
  b.disabled=true;try{const r=await api('/v1/admin/access',{id:b.dataset.user,action:b.dataset.action});if(r.invite)inviteResult=r;if(b.dataset.action==='delete')inviteResult=null;adminMessage=b.dataset.action==='delete'?'Usuário excluído.':'Acesso atualizado.';await loadUsers();}catch(e){adminMessage=e.message;render();}
 });
}
function positions(){const a=data?.state?.positions||[];return a.length?`<div class="tablewrap"><table class="table"><thead><tr><th>POSIÇÃO</th><th>TIPO</th><th>LOTE</th><th>ENTRADA</th><th>SL</th><th>TP</th><th>RESULTADO FLUTUANTE</th></tr></thead><tbody>${a.map(p=>`<tr><td>${esc(p.id)}</td><td>${side(p.side)}</td><td>${num(p.volume)}</td><td>${num(p.price)}</td><td>${p.sl?num(p.sl):'—'}</td><td>${p.tp?num(p.tp):'—'}</td><td>${num(p.profit)} ${esc(data.state.currency)}</td></tr>`).join('')}</tbody></table></div>`:empty('Nenhuma posição recebida em aberto.');}
const recentDeals=()=>[...(data?.deals||[])].sort((a,b)=>Number(b.time)-Number(a.time));
const dealNet=d=>Number(d.profit||0)+Number(d.commission||0)+Number(d.swap||0)+Number(d.fee||0);
const japanDayStart=()=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const date=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return Date.UTC(Number(date.year),Number(date.month)-1,Number(date.day))-9*60*60*1000;
};
const isExitDeal=d=>[1,2,3].includes(Number(d.entry));
const dailySummary=()=>{
 const today=recentDeals().filter(d=>Number(d.time)>=japanDayStart());
 const exits=today.filter(isExitDeal);
 const entries=today.filter(d=>Number(d.entry)===0);
 return {entries:entries.length,closed:exits.length,net:exits.reduce((sum,d)=>sum+dealNet(d),0)};
};
const dailyResult=()=>{
 const d=dailySummary(),currency=esc(data?.state?.currency||''),positive=d.net>=0;
 const amount=`${positive?'+':''}${num(d.net)} ${currency}`;
 return card('Resultado diário',`<div style="display:flex;gap:18px;align-items:baseline;flex-wrap:wrap"><b style="font-size:1.45rem;color:${positive?'#10d7a0':'#ff4c64'}">${amount}</b><span class="pill ${positive?'green':'red'}">${positive?'POSITIVO':'NEGATIVO'}</span></div><p class="sub daily-summary-short">${d.closed} saída${d.closed===1?'':'s'} · ${d.entries} entrada${d.entries===1?'':'s'}</p><p class="sub daily-summary-detail">Soma de lucro, comissão, swap e taxa das saídas; horários do Japão.</p>`,'daily-result-card');
};
function tradeHistory(){const ds=recentDeals().slice(0,200);return `<p class="sub">Execuções individuais, incluindo saídas parciais. Horários informados pelo servidor da corretora. Até 200 execuções mais recentes.</p>`+(ds.length?`<div class="tablewrap execution-scroll" style="max-height:460px;overflow:auto;border:1px solid #223348;border-radius:10px"><table class="table"><thead style="position:sticky;top:0;z-index:2;background:#0b1b2d"><tr><th class="execution-id">EXECUÇÃO</th><th class="execution-mobile-time">HORA</th><th class="execution-event">EVENTO</th><th>LADO DA EXECUÇÃO</th><th>LOTE</th><th class="execution-price">PREÇO</th><th class="execution-broker-time">HORÁRIO CORRETORA</th><th>RESULTADO + CUSTOS</th></tr></thead><tbody>${ds.map(d=>`<tr><td class="execution-id">${esc(d.id)}</td><td class="execution-mobile-time">${new Date(d.time*1000).toISOString().slice(11,19)}</td><td class="execution-event">${['Entrada','Saída','Reversão','Saída por posição oposta'][d.entry]}</td><td>${side(d.side)}</td><td>${num(d.volume)}</td><td class="execution-price">${num(d.price)}</td><td class="execution-broker-time">${new Date(d.time*1000).toISOString().slice(0,19).replace('T',' ')}</td><td>${num(dealNet(d))} ${esc(data.state?.currency)}</td></tr>`).join('')}</tbody></table></div>`:empty('O histórico aparecerá após a primeira sincronização.'));}
const card=(title,body,className='')=>`<section class="card ${className}"><h3>${title}</h3>${body}</section>`;
const heading=(title,subtitle)=>`<div class="pagehead"><div class="eyebrow">TOKAI INVEST</div><h1>${title}</h1><div class="sub">${subtitle}</div></div>`;
const link=(id,label)=>`<button class="btn goldbtn full" data-page="${id}">${label}</button>`;
const waiting='Aguardando conexão com o MT5';
function candleView(){
 const bars=data?.state?.candles?.[tf]||[];
 if(!bars.length)return `<div class="empty" role="status" style="min-height:360px;display:grid;align-content:center"><b>Gráfico XAUUSD · ${tf}</b><p>${data?.online?'Aguardando velas do monitor MT5':'Aguardando dados de candles'}</p><p class="sub">O gráfico aparecerá após o recebimento das velas da conta principal.</p></div>`;
 const W=915,H=360,L=16,T=25,B=32,w=W-L,h=H-T-B;
 let low=Math.min(...bars.map(b=>b.low)),high=Math.max(...bars.map(b=>b.high));
 const pad=Math.max((high-low)*.08,.01);low-=pad;high+=pad;
 const baseRange=high-low,visibleRange=baseRange/chartYScale,middle=(high+low)/2+chartYPan*baseRange;low=middle-visibleRange/2;high=middle+visibleRange/2;
 const y=v=>T+(high-v)/(high-low)*h,step=w/bars.length,x=i=>L+(i+.5)*step,bw=Math.max(1,step*.65);
 const clock=t=>new Date(t*1000).toISOString().slice(11,16);
 const date=t=>new Date(t*1000).toISOString().slice(0,16).replace('T',' ');
 const levels=Array.from({length:6},(_,i)=>{const v=high-(high-low)*i/5;return {v,yy:y(v)};});
 const grid=levels.map(({yy})=>`<line x1="${L}" x2="${W}" y1="${yy}" y2="${yy}" stroke="#223348"/>`).join('');
 const axis=levels.map(({v,yy})=>`<line x1="0" x2="85" y1="${yy}" y2="${yy}" stroke="#223348"/><text x="8" y="${yy+4}" fill="#91a3b8" font-size="11">${num(v)}</text>`).join('');
 const ticks=Array.from({length:5},(_,i)=>{const n=Math.round((bars.length-1)*i/4);return `<text x="${x(n)}" y="${H-10}" fill="#91a3b8" font-size="11" text-anchor="middle">${clock(bars[n].time)}</text>`;}).join('');
 const bodies=bars.map((b,i)=>{const color=b.close>=b.open?'#10d7a0':'#ff4c64';return `<g><title>${date(b.time)} | A ${b.open} · Máx ${b.high} · Mín ${b.low} · F ${b.close}</title><line x1="${x(i)}" x2="${x(i)}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${color}"/><rect x="${x(i)-bw/2}" y="${y(Math.max(b.open,b.close))}" width="${bw}" height="${Math.max(1,y(Math.min(b.open,b.close))-y(Math.max(b.open,b.close)))}" fill="${color}"/></g>`;}).join('');
 const seconds={M1:60,M5:300,M15:900}[tf];
 const marks=(data.deals||[]).map(d=>{const i=bars.findIndex(b=>d.time>=b.time&&d.time<b.time+seconds);if(i<0||d.price<low||d.price>high)return '';const label=d.entry===0?side(d.side):d.entry===2?'REVERSÃO':'SAÍDA';const color=d.entry===0?(d.side==='BUY'?'#10d7a0':'#ff4c64'):'#f4bf48';const direction=d.entry!==0?'exit':d.side==='BUY'?'buy':'sell';const shape=direction==='buy'?'M0 0 L-6 9 H-2 V16 H2 V9 H6 Z':direction==='sell'?'M0 0 L-6 -9 H-2 V-16 H2 V-9 H6 Z':'M0 0 L-9 -6 V-2 H-16 V2 H-9 V6 Z';return `<g data-marker="${direction}" transform="translate(${x(i)} ${y(d.price)})"><title>${label} · ${esc(d.id)} · ${date(d.time)} · ${num(d.price)}</title><path d="${shape}" fill="${color}" stroke="#071321" stroke-width="1" vector-effect="non-scaling-stroke"/></g>`;}).join('');
 return `<div class="candle-stage" style="position:relative;height:360px;overflow:hidden"><div id="candle-scroll" title="Arraste o gráfico para cima ou para baixo para reposicionar as velas" style="position:absolute;inset:0 85px 0 0;overflow-x:auto;overflow-y:hidden;overflow-anchor:none;cursor:grab"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Candles reais de ${esc(data.state.symbol)} em ${tf}, horário da corretora" style="display:block;width:${Math.round(chartZoom*100)}%;min-width:100%;height:360px">${grid}${ticks}${bodies}${marks}</svg></div><svg viewBox="0 0 85 ${H}" aria-label="Régua de preços" style="position:absolute;right:0;top:0;width:85px;height:360px;background:#071321;border-left:1px solid #223348">${axis}<rect data-price-axis x="0" y="0" width="85" height="${H-B}" fill="transparent" style="cursor:ns-resize;touch-action:none"><title>Arraste para cima ou para baixo para ajustar a escala vertical. Duplo clique restaura.</title></rect></svg></div>`;
}
function chart(){const bars=data?.state?.candles?.[tf]||[];const stale=bars.length&&(!data.state.candles_received_at||Date.now()-data.state.candles_received_at>30000);const m1=tf==='M1'?(()=>{const open=data?.state?.positions||[],floating=open.reduce((sum,p)=>sum+Number(p.profit||0),0),lot=open.reduce((sum,p)=>sum+Number(p.volume||0),0),from=bars[0]?.time||0,to=(bars.at(-1)?.time||0)+60,entries=(data?.deals||[]).filter(d=>Number(d.entry)===0&&Number(d.time)>=from&&Number(d.time)<to).length,currency=esc(data?.state?.currency||''),color=floating>=0?'#10d7a0':'#ff4c64';return `<div class="grid g3 chart-mini-stats" style="margin:14px 0"><div style="padding:12px;border:1px solid #223348;border-radius:10px"><small class="sub">RESULTADO FLUTUANTE</small><b style="display:block;margin-top:4px;color:${color}">${floating>=0?'+':''}${num(floating)} ${currency}</b><small class="sub">Posições abertas agora</small></div><div style="padding:12px;border:1px solid #223348;border-radius:10px"><small class="sub">ENTRADAS NO M1</small><b style="display:block;margin-top:4px">${entries}</b><small class="sub">No intervalo exibido</small></div><div style="padding:12px;border:1px solid #223348;border-radius:10px"><small class="sub">LOTE EM POSIÇÃO</small><b style="display:block;margin-top:4px">${num(lot)}</b><small class="sub">${open.length} posição${open.length===1?'':'ões'} aberta${open.length===1?'':'s'}</small></div></div>`;})():'';return card('Gráfico de candles',`<div class="row chart-toolbar"><div class="tools chart-timeframes">${['M1','M5','M15'].map(t=>`<button data-tf="${t}" class="${tf===t?'active':''}">${t}</button>`).join('')}</div><div class="chart-status"><span class="pill gold">${bars.length?(stale?'Velas desatualizadas':bars.length+' velas recebidas'):'Aguardando dados'}</span><button class="btn chart-expand-desktop" id="toggle-chart-expanded" type="button" aria-pressed="${chartExpanded}">${chartExpanded?'Fechar gráfico':'Ampliar gráfico'}</button></div></div>${m1}<div class="row chart-controls" style="margin:14px 0"><button class="btn" id="zoom-out" type="button" ${chartZoom<=1?'disabled':''}>− Zoom</button><span class="pill">Zoom horizontal ${Math.round(chartZoom*100)}%</span><button class="btn" id="zoom-in" type="button" ${chartZoom>=4?'disabled':''}>+ Zoom</button><button class="btn chart-expand-mobile" id="toggle-chart-expanded-mobile" type="button" aria-pressed="${chartExpanded}">${chartExpanded?'Fechar':'↗ Ampliar'}</button><button class="btn" id="follow-candles" type="button" aria-pressed="true">Acompanhando última vela</button></div><div class="chartbox" style="height:360px;max-height:360px;overflow:hidden">${candleView()}</div><div class="legend"><span><b aria-hidden="true" style="color:#10d7a0">↑</b> Alta / compra</span><span><b aria-hidden="true" style="color:#ff4c64">↓</b> Baixa / venda</span><span><b aria-hidden="true" style="color:#f4bf48">→</b> Saída / reversão</span></div><p class="sub"><b>Escala vertical ${Math.round(chartYScale*100)}%:</b> arraste a régua de preços à direita para esticar ou comprimir as velas. Arraste o centro do gráfico para cima ou para baixo para reposicioná-las. Dê duplo clique na régua para restaurar escala e posição. Use + Zoom e − Zoom para a largura das velas e deslize horizontalmente. Horário da corretora; a última vela pode estar em formação.</p>`,chartExpanded?'chart-panel chart-expanded':'chart-panel');}
function bodyForPage(online){
 const s=data?.state,currency=esc(s?.currency||''),pending=empty(waiting);
 const status=online?'Recebendo dados':s?'Sem transmissão recente':waiting;
 const last=data?.received_at?new Date(data.received_at).toLocaleString('pt-BR',{timeZone:'Asia/Tokyo'})+' (Japão)':'aguardando';
 if(page==='home')return `<div class="home-heading">${heading('Visão geral','Acompanhe o robô e as operações do XAUUSD.')}</div>`+`<div class="grid g4 home-summary">${metric('CONEXÃO MT5',online?'● Conectado':'● Offline','Estado do monitor; não confirma atividade do robô')}${metric('XAUUSD (OURO)',s?num(s.bid):'—',s?'Último bid recebido':waiting)}${metric('OPERAÇÕES ABERTAS',s?s.positions.length:'—','Última sincronização')}${metric('RESULTADO FLUTUANTE',s?num(s.positions.reduce((a,p)=>a+p.profit,0))+' '+currency:'—','Posições abertas; não é o resultado do dia')}</div><div class="home-daily">${dailyResult()}</div><div class="grid g2 home-chart-and-executions">${chart()}${card('Últimas execuções',data?.deals?.length?tradeHistory():pending,'last-executions-card')}</div><div class="home-open-positions">${card('Posições abertas',positions())}</div>`;
 if(page==='market')return heading('XAUUSD (Ouro)','Candles e operações marcadas')+`<div class="grid g3" style="margin-bottom:14px">${metric('BID / ASK',s?num(s.bid)+' / '+num(s.ask):'—','Última cotação recebida')}${metric('CONEXÃO',online?'Conectado':'Offline',status)}${metric('PERÍODO',tf,'Candles da mesma conta MT5')}</div>`+chart()+`<div class="grid g2" style="margin-top:14px">${card('Histórico relacionado',data?.deals?.length?tradeHistory():pending)}${card('Como ler os marcadores','<div class="row">Entrada de compra <span class="pill green">COMPRA</span></div><div class="row">Entrada de venda <span class="pill red">VENDA</span></div><div class="row">Saída da operação <span class="pill gold">SAÍDA</span></div><p class="sub">Marcadores indicam execuções recebidas dentro do período visível. Saídas parciais e reversões são identificadas nos detalhes.</p>')}</div>`;
 if(page==='trades')return heading('Operações','Posições abertas na última sincronização.')+card('Posições da conta principal',positions());
 if(page==='history')return heading('Histórico de operações','Entradas, saídas e resultados recebidos do MT5.')+card('Histórico',tradeHistory());
 if(page==='connect')return heading('Conectar MT5','Monitor da conta principal no Windows do Parallels.')+`<div class="grid g2">${card('Conta principal',`<div class="listitem"><div class="symbol">M</div><div class="desc"><b>MetaTrader 5</b><small>Windows no Parallels</small></div><span class="pill ${online?'green':'gold'}">${online?'Conectada':'Aguardando'}</span></div><p>Status: <b>${status}</b></p><p>Último recebimento: ${last}</p><p class="sub">Instale o TokaiMonitor em um gráfico separado. A senha da corretora permanece no terminal.</p>`)}${card('Etapas da integração','<div class="checkrow">Servidor e painel <span class="pill green">Disponíveis</span></div><div class="checkrow">Monitor no MT5 <span class="pill gold">Validar no terminal</span></div><div class="checkrow">Candles <span class="pill gold">Requer monitor 1.10</span></div><div class="checkrow">Notificações <span class="pill green">Disponíveis para ativar</span></div><p class="sub">Mantenha o Windows virtual, o MT5 e o monitor abertos. A suspensão do Mac interrompe o envio.</p>')}</div>`;
 if(page==='users'&&identity?.role==='admin')return usersPage();
 return empty('Página indisponível.');
}
function bindChart(){
 const box=document.getElementById('candle-scroll');
 if(!box)return;
 box.scrollLeft=followCandles?box.scrollWidth:chartScrollLeft;
 const button=document.getElementById('follow-candles');
 const label=()=>{if(button){button.textContent=followCandles?'Acompanhando última vela':'Voltar à última vela';button.setAttribute('aria-pressed',String(followCandles));}};
 box.onscroll=()=>{chartScrollLeft=box.scrollLeft;followCandles=box.scrollWidth-box.clientWidth-box.scrollLeft<=12;label();};
 box.ondblclick=e=>{const rect=box.getBoundingClientRect();if(e.clientY<rect.bottom-18){chartYPan=0;render();}};
 box.onpointerdown=e=>{
  if(e.button!==0)return;const rect=box.getBoundingClientRect();if(e.clientY>=rect.bottom-18)return;
  e.preventDefault();const startY=e.clientY,startPan=chartYPan,plotHeight=Math.max(120,rect.height-57),scale=chartYScale;let scheduled=false,lastY=startY;
  document.body.style.userSelect='none';box.style.cursor='grabbing';
  const move=event=>{lastY=event.clientY;if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;chartYPan=Math.max(-3,Math.min(3,startPan+(lastY-startY)/(plotHeight*scale)));render();});};
  const stop=()=>{document.body.style.userSelect='';window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);};
  window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);
 };
 if(button)button.onclick=()=>{followCandles=true;box.scrollLeft=box.scrollWidth;chartScrollLeft=box.scrollLeft;label();};
 const axis=box.parentElement.querySelector('[data-price-axis]');
 if(axis){
  axis.ondblclick=()=>{chartYScale=1;chartYPan=0;render();};
  axis.onpointerdown=e=>{
   e.preventDefault();const startY=e.clientY,startScale=chartYScale;let scheduled=false,lastY=startY;
   const move=event=>{lastY=event.clientY;if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;chartYScale=Math.max(.25,Math.min(8,startScale*Math.exp((startY-lastY)/120)));render();});};
   const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);};
   window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);
  };
 }
 label();
}
function arrangeLandscapeChartControls(){if(!chartExpanded||!window.matchMedia('(min-width:651px) and (max-width:1180px) and (orientation:landscape)').matches)return;const toolbar=document.querySelector('.chart-expanded .chart-toolbar'),controls=document.querySelector('.chart-expanded .chart-controls'),status=toolbar?.querySelector('.chart-status');if(toolbar&&controls&&status)toolbar.insertBefore(controls,status);}
function render(){
 if(!token||!identity||!data){login();return;}
 updateNav();if(!nav.some(n=>n[0]===page))page='home';
 const online=data.online&&!error&&Date.now()-data.received_at<30000;
 lastCandleStale=!!data.state?.candles_received_at&&Date.now()-data.state.candles_received_at>30000;
 const message=error?esc(error):online?'Dados recebidos do MT5.':data.received_at?'Sem conexão recente. Exibindo o último recebimento.':waiting+'. Nenhuma operação recebida ainda.';
  document.body.classList.toggle('chart-fullscreen',chartExpanded);
 root.innerHTML=`<div class="app"><aside class="side"><div class="brand"><img class="brand-logo" src="marca-tokai-invest.jpeg" alt="TOKAI INVEST"><div><b>TOKAI <em>INVEST</em></b><small>SINAIS DE TRADING</small></div></div><div class="navlabel">PAINEL</div><nav class="nav">${nav.map(([id,icon,t])=>`<button data-page="${id}" class="${page===id?'active':''}">${icon} &nbsp; ${t}</button>`).join('')}</nav><div class="side-note"><b>● ${online?'MT5 conectado':'Aguardando MT5'}</b><br>Sinais em teste · somente consulta.<br>Ative os alertas neste aparelho.</div><button class="btn" id="logout">Sair</button></aside><main class="main"><header class="top"><strong>${nav.find(n=>n[0]===page)[2]}</strong><div class="tools"><span class="badge">SINAIS · TESTE</span><button id="refresh">Atualizar</button><button id="header-logout">Sair</button></div></header><div class="content"><div class="alert" role="status">${message}</div>${window.tokaiPush?.html()||''}${bodyForPage(online)}</div></main></div><nav class="bottomnav">${nav.filter(n=>n[0]!=='connect').map(n=>{const id=n[0];return `<button data-page="${id}" class="${page===id?'active':''}"><span>${n[1]}</span>${n[2]}</button>`;}).join('')}</nav>`;
 arrangeLandscapeChartControls();
 document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=b.dataset.page;render();window.scrollTo(0,0);if(page==='users')loadUsers();});
 document.querySelectorAll('[data-tf]').forEach(b=>b.onclick=()=>{tf=b.dataset.tf;followCandles=true;chartScrollLeft=0;chartYScale=1;chartYPan=0;render();});
 document.getElementById('zoom-in')?.addEventListener('click',()=>{chartZoom=Math.min(4,Number((chartZoom+.25).toFixed(2)));followCandles=true;render();});
 document.getElementById('zoom-out')?.addEventListener('click',()=>{chartZoom=Math.max(1,Number((chartZoom-.25).toFixed(2)));followCandles=true;render();});
  ['toggle-chart-expanded','toggle-chart-expanded-mobile'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>{chartExpanded=!chartExpanded;render();}));
 bindChart();
 document.getElementById('refresh').onclick=()=>page==='users'?loadUsers():refresh();
 if(page==='users')bindAdmin();
 window.tokaiPush?.bind(api,render);
 document.querySelectorAll('#logout,#header-logout').forEach(b=>b.onclick=logout);
}
async function refresh(force=true){
 if(busy||!token)return;busy=true;const current=token;
 let changed=force;
 try{
  if(!identity){const me=await api('/v1/me',undefined,current);if(current!==token)return;identity=me.user;updateNav();await window.tokaiPush?.restore(api).catch(()=>{});}
  const result=await api('/v1/state',undefined,current);if(current!==token)return;
  const candleStale=d=>!!d?.state?.candles_received_at&&Date.now()-d.state.candles_received_at>30000;
  changed=changed||!data||!!error||data.received_at!==result.received_at||data.online!==result.online||lastCandleStale!==candleStale(result);
  data=result;error='';
 }catch(e){if(current!==token)return;if(e.status===401){clearAccess();error='Sessão encerrada ou acesso indisponível. Entre novamente.';}else error='Não foi possível atualizar. Os dados podem estar desatualizados.';}
 finally{busy=false;if(current===token||!token){if(page!=='users'&&(changed||error))render();}}
}
// One request at a time; hidden tabs stop polling. Offline/error retries stay at 1s.
let nextRefreshAt=0;
setInterval(()=>{if(!document.hidden&&Date.now()>=nextRefreshAt){nextRefreshAt=Date.now()+(!error&&data?.online?500:1000);refresh(false);}},500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});let chartOrientationTimer;window.addEventListener('resize',()=>{if(chartExpanded){clearTimeout(chartOrientationTimer);chartOrientationTimer=setTimeout(render,80);}});
if(inviteCode){clearAccess();login();}else if(token){root.innerHTML='<div class="empty">Verificando acesso…</div>';refresh();}else login();


