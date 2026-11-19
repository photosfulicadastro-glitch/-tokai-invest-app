'use strict';
(() => {
  const $ = s => document.querySelector(s);
  const money = n => '¥' + n.toLocaleString('pt-BR');
  const plans = ['Mensal','Semestral','Anual'];
  const prices = {student:[5000,27000,48000],regular:[15000,81000,144000]};
  let profile = 'student';
  document.querySelectorAll('[name="profile"]').forEach(input => input.addEventListener('change', () => {
    profile = input.value;
    prices[profile].forEach((price,i) => {
      $(`[data-plan="${i}"]`).textContent = money(price);
      $(`[data-equivalent="${i}"]`).textContent = i ? `Equivale a ${money(price / (i===1?6:12))}/mês` : 'Cobrança mensal';
    });
  }));
  let opener;
  function openDialog(dialog) { opener=document.activeElement; dialog.showModal(); }
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('close',()=>opener?.focus()));
  document.querySelectorAll('[data-select]').forEach(button => button.addEventListener('click',()=>{
    const i=Number(button.dataset.select);
    $('#selection').textContent=`${plans[i]} · ${profile==='student'?'Aluno Tokai':'Não aluno'} · ${money(prices[profile][i])}${i===0?'/mês':` pelo período de ${i===1?6:12} meses`}.`;
    openDialog($('#conditions'));
  }));
  document.querySelectorAll('[data-legal]').forEach(button=>button.addEventListener('click',()=>{
    $('#selection').textContent='Consulte as informações essenciais antes de escolher uma assinatura.';
    openDialog($('#conditions'));
  }));
  $('.menu-toggle').addEventListener('click',()=>{
    const expanded=$('.menu-toggle').getAttribute('aria-expanded')!=='true';
    $('.menu-toggle').setAttribute('aria-expanded',String(expanded)); $('#menu').classList.toggle('open',expanded);
  });
  document.querySelectorAll('#menu a').forEach(a=>a.addEventListener('click',()=>{ $('#menu').classList.remove('open'); $('.menu-toggle').setAttribute('aria-expanded','false'); }));
  let notificationCount=0;
  $('#notify').addEventListener('click',()=>{
    notificationCount++;
    $('#notification').textContent=`Aviso ilustrativo ${notificationCount} · XAUUSD · ${notificationCount%2?'Abertura de compra':'Encerramento de compra'} registrada. Dados fictícios; nenhuma operação foi executada.`;
  });
  // Gráfico público do TradingView, em iframe próprio (sem script de terceiros nesta página).
  function renderMarket(interval) {
    const cfg={autosize:true,symbol:'OANDA:XAUUSD',interval,timezone:'Asia/Tokyo',theme:'dark',style:'1',locale:'br',allow_symbol_change:false,hide_top_toolbar:true,hide_side_toolbar:true,hide_legend:false,hide_volume:true,save_image:false,calendar:false,details:false,withdateranges:false,backgroundColor:'#10253b',gridColor:'rgba(90,130,160,0.12)',support_host:'https://www.tradingview.com'};
    const frame=document.querySelector('#market-iframe');
    if(frame)frame.src='https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=br#'+encodeURIComponent(JSON.stringify(cfg));
  }
  document.querySelectorAll('[data-interval]').forEach(button=>button.addEventListener('click',()=>{
    if(button.getAttribute('aria-pressed')==='true') return;
    document.querySelectorAll('[data-interval]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    renderMarket(button.dataset.interval);
  }));
  renderMarket('1');
  const ns='http://www.w3.org/2000/svg';
  function svgNode(tag,attrs) { const n=document.createElementNS(ns,tag); for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v); return n; }
  // Simulação ilustrativa com dados 100% fictícios.
  const N=60, W=640, H=300, PL=10, PR=62, PT=14, PB=26;
  const sma=(a,i,n)=>{let s=0;for(let k=i-n+1;k<=i;k++)s+=a[k].c;return s/n;};
  const sd=(a,i,n,m)=>{let s=0;for(let k=i-n+1;k<=i;k++)s+=(a[k].c-m)**2;return Math.sqrt(s/n);};
  const sim={data:[],marks:[],pos:0,tick:0,burst:0,last:2645};
  function nextCandle(){
    if(sim.burst<=0&&Math.random()<.07)sim.burst=3+Math.floor(Math.random()*3);
    const dir=sim.dirB||(sim.dirB=Math.random()<.5?1:-1);
    const vol=sim.burst>0?1.6:1; if(sim.burst>0){sim.burst--;if(sim.burst===0)sim.dirB=0;}
    const i=sim.data.length, m=i>=19?sma(sim.data,i-1,Math.min(20,i)):sim.last;
    const drift=sim.burst>0?dir*2.4:(m-sim.last)*.22;
    const o=sim.last,c=Math.max(2615,Math.min(2675,o+drift+(Math.random()-.5)*2*vol));
    return {o,c,h:Math.max(o,c)+Math.random()*vol*.7,l:Math.min(o,c)-Math.random()*vol*.7};
  }
  function evaluate(idx){
    const d=sim.data; if(idx<19)return;
    const m=sma(d,idx,20),s=sd(d,idx,20,m),c=d[idx].c;
    if(sim.pos===0){ if(c<m-3*s){sim.pos=1;sim.marks.push({i:idx,t:'buy',p:c});} else if(c>m+3*s){sim.pos=-1;sim.marks.push({i:idx,t:'sell',p:c});} }
    else if((sim.pos===1&&c>=m)||(sim.pos===-1&&c<=m)){sim.pos=0;sim.marks.push({i:idx,t:'exit',p:c});}
  }
  function seed(){
    sim.data=[];sim.marks=[];sim.pos=0;sim.last=2645;
    for(let i=0;i<N;i++){const c=nextCandle();sim.data.push(c);sim.last=c.c;evaluate(i-1);}
  }
  function shift(){
    sim.data.shift();sim.marks=sim.marks.map(k=>({...k,i:k.i-1})).filter(k=>k.i>=0);
    const c=nextCandle();sim.data.push(c);sim.last=c.c;evaluate(sim.data.length-2);
  }
  function drawSim(svg){
    svg.replaceChildren();
    const d=sim.data;
    let lo=Infinity,hi=-Infinity;d.forEach(c=>{lo=Math.min(lo,c.l);hi=Math.max(hi,c.h);});
    const pad=(hi-lo)*.12||1;lo-=pad;hi+=pad;
    const y=p=>PT+(hi-p)/(hi-lo)*(H-PT-PB), step=(W-PL-PR)/N, x=i=>PL+step*(i+.5);
    const defs=svgNode('defs',{}),cp=svgNode('clipPath',{id:'sim-clip'});cp.append(svgNode('rect',{x:PL,y:PT,width:W-PL-PR,height:H-PT-PB}));defs.append(cp);svg.append(defs);
    const span=hi-lo,q=span>40?10:span>16?5:2;
    for(let p=Math.ceil(lo/q)*q;p<=hi;p+=q){
      svg.append(svgNode('path',{d:`M${PL} ${y(p)}H${W-PR}`,stroke:'#1b2733','stroke-width':'.7'}));
      const t=svgNode('text',{x:W-PR+8,y:y(p)+4,fill:'#8faac2','font-size':11});t.textContent=p.toFixed(0);svg.append(t);
    }
    const g=svgNode('g',{'clip-path':'url(#sim-clip)'});
    const bands=[[3,'#ff4c64'],[4,'#f5d33d']];
    for(const [k,col] of bands)for(const sgn of [1,-1]){
      let path='';
      for(let i=19;i<d.length;i++){const m=sma(d,i,20),s=sd(d,i,20,m);path+=(path?'L':'M')+x(i).toFixed(1)+' '+y(m+sgn*k*s).toFixed(1);}
      g.append(svgNode('path',{d:path,fill:'none',stroke:col,'stroke-width':1.2}));
    }
    d.forEach((c,i)=>{const col=c.c>=c.o?'#3ad98f':'#f0425a';
      g.append(svgNode('line',{x1:x(i),y1:y(c.h),x2:x(i),y2:y(c.l),stroke:col,'stroke-width':1.2}));
      g.append(svgNode('rect',{x:x(i)-step*.32,y:Math.min(y(c.o),y(c.c)),width:step*.64,height:Math.max(1.5,Math.abs(y(c.o)-y(c.c))),fill:col}));});
    svg.append(g);
    sim.marks.forEach(k=>{const c=d[k.i],px=x(k.i);let n;
      if(k.t==='buy')n=svgNode('path',{d:`M${px} ${y(c.l)+14}V${y(c.l)+5}M${px-4} ${y(c.l)+9}L${px} ${y(c.l)+4}L${px+4} ${y(c.l)+9}`,stroke:'#63e5b8','stroke-width':2,fill:'none'});
      else if(k.t==='sell')n=svgNode('path',{d:`M${px} ${y(c.h)-14}V${y(c.h)-5}M${px-4} ${y(c.h)-9}L${px} ${y(c.h)-4}L${px+4} ${y(c.h)-9}`,stroke:'#ff91a3','stroke-width':2,fill:'none'});
      else n=svgNode('path',{d:`M${px+5} ${y(c.c)}H${px+15}M${px+11} ${y(c.c)-4}L${px+15} ${y(c.c)}L${px+11} ${y(c.c)+4}`,stroke:'#f5d33d','stroke-width':2,fill:'none'});
      svg.append(n);
      const lbl=svgNode('text',{'font-size':10,'font-weight':600,fill:k.t==='buy'?'#63e5b8':k.t==='sell'?'#ff91a3':'#f5d33d','text-anchor':px>W-PR-90?'end':'start'});
      const name=k.t==='buy'?'Compra':k.t==='sell'?'Venda':'Saída';
      const ly=k.t==='buy'?y(c.l)+26:k.t==='sell'?y(c.h)-18:y(c.c)-9;
      lbl.setAttribute('x',px>W-PR-90?px-4:px+(k.t==='exit'?6:-4));lbl.setAttribute('y',ly);
      lbl.textContent=name+' '+k.p.toFixed(2);svg.append(lbl);});
    const lc=d[d.length-1].c;
    svg.append(svgNode('path',{d:`M${PL} ${y(lc)}H${W-PR}`,stroke:'#cfe3f7','stroke-dasharray':'2 3','stroke-width':.8}));
    svg.append(svgNode('rect',{x:W-PR+2,y:y(lc)-8,width:PR-4,height:16,fill:'#2a6fb0',rx:2}));
    const lt=svgNode('text',{x:W-PR+6,y:y(lc)+4,fill:'#fff','font-size':11});lt.textContent=lc.toFixed(2);svg.append(lt);
    const t=svgNode('text',{x:PL+4,y:H-8,fill:'#8faac2','font-size':11});t.textContent='Dados fictícios · sem conexão com o mercado';svg.append(t);
  }
  const simSvg=document.querySelector('[data-chart="system"]');
  seed();if(simSvg)drawSim(simSvg);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=reduced.matches;
  function syncPause(){ $('#pause').textContent=paused?'Retomar simulação':'Pausar simulação';$('#pause').setAttribute('aria-pressed',String(paused)); }
  $('#pause').addEventListener('click',()=>{paused=!paused;syncPause();});
  reduced.addEventListener('change',e=>{paused=e.matches;syncPause();});
  syncPause();
  setInterval(()=>{
    if(paused||document.hidden||!simSvg)return;
    const last=sim.data[sim.data.length-1];
    if(++sim.tick%6===0)shift();
    else{last.c=Math.max(2600,Math.min(2700,last.c+(Math.random()-.5)*1.2));last.h=Math.max(last.h,last.c);last.l=Math.min(last.l,last.c);}
    drawSim(simSvg);
  },700);
})();
