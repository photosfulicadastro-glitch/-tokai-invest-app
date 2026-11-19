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
  const y = price => 270-(price-2625)*4.5;
  function candle(open) { const close=Math.max(2630,Math.min(2675,open+(Math.random()-.49)*9)); return {open,close,high:Math.max(open,close)+Math.random()*3,low:Math.min(open,close)-Math.random()*3}; }
  const charts = [...document.querySelectorAll('[data-chart]')].map((svg,index)=>{
    let data=[],last=2644+index*3;
    for(let i=0;i<34;i++){const c=candle(last);data.push(c);last=c.close;}
    return {svg,data,ticks:0};
  });
  function draw({svg,data}) {
    svg.replaceChildren();
    for(let price=2630;price<=2675;price+=10) {
      svg.append(svgNode('path',{d:`M12 ${y(price)}H550`,stroke:'#244057','stroke-width':'.7'}));
      const t=svgNode('text',{x:565,y:y(price)+4,fill:'#8faac2','font-size':12});t.textContent=price.toFixed(0);svg.append(t);
    }
    for(let x=15;x<550;x+=60)svg.append(svgNode('path',{d:`M${x} 20V270`,stroke:'#1b354c','stroke-width':'.5'}));
    data.forEach((c,i)=>{const x=18+i*15.4,color=c.close>=c.open?'#3ad9af':'#ef718a';svg.append(svgNode('line',{x1:x,y1:y(c.high),x2:x,y2:y(c.low),stroke:color,'stroke-width':1.3}),svgNode('rect',{x:x-4.5,y:Math.min(y(c.open),y(c.close)),width:9,height:Math.max(1.5,Math.abs(y(c.open)-y(c.close))),fill:color,rx:1}));});
    if(svg.dataset.chart==='levels') [[2668,'ALVO','#63e5b8'],[2650,'ENTRADA','#65d3ff'],[2638,'STOP','#ff91a3']].forEach(([price,label,color])=>{
      svg.append(svgNode('path',{d:`M10 ${y(price)}H550`,stroke:color,'stroke-dasharray':'5 5'}));
      svg.append(svgNode('rect',{x:440,y:y(price)-17,width:110,height:16,fill:'#0a1b2e',rx:3}));
      const t=svgNode('text',{x:446,y:y(price)-5,fill:color,'font-size':11,'font-weight':600});t.textContent=label+' '+price;svg.append(t);
    });
    const t=svgNode('text',{x:16,y:292,fill:'#8faac2','font-size':12});t.textContent='Dados fictícios · sem conexão com o mercado';svg.append(t);
  }
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=reduced.matches;
  function syncPause(){ $('#pause').textContent=paused?'Retomar simulação':'Pausar simulação';$('#pause').setAttribute('aria-pressed',String(paused)); }
  $('#pause').addEventListener('click',()=>{paused=!paused;syncPause();});
  reduced.addEventListener('change',e=>{paused=e.matches;syncPause();});
  charts.forEach(draw);syncPause();
  setInterval(()=>{
    if(paused||document.hidden)return;
    charts.forEach(chart=>{
      const last=chart.data.at(-1);
      if(++chart.ticks%6===0){chart.data.shift();chart.data.push(candle(last.close));}
      else { last.close=Math.max(2630,Math.min(2675,last.close+(Math.random()-.5)*2.5));last.high=Math.max(last.high,last.close);last.low=Math.min(last.low,last.close); }
      draw(chart);
    });
  },700);
})();
