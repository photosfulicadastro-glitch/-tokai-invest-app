import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function app(){
 let box,button,renders=0,interval,requestHandler,requestCount=0;
 const generic={addEventListener(){}};
 const root={set innerHTML(value){this.html=value;renders++;box={scrollWidth:650,clientWidth:300,scrollLeft:0};button={setAttribute(){}};},get innerHTML(){return this.html;}};
 const document={hidden:false,addEventListener(){},querySelectorAll:()=>[],getElementById:id=>id==='root'?root:id==='candle-scroll'?(root.html.includes('candle-scroll')?box:null):id==='follow-candles'?button:generic};
 const XMLHttpRequest=class{open(){}setRequestHeader(){}send(){requestCount++;Promise.resolve().then(()=>requestHandler?requestHandler():{}).then(payload=>{this.status=200;this.responseText=JSON.stringify(payload);this.onload?.();}).catch(()=>this.onerror?.());}};
 const context=vm.createContext({document,XMLHttpRequest,window:{TOKAI_API_URL:'https://example.com',history:{replaceState(){}},scrollTo(){}},location:{hash:'',pathname:'/',search:''},sessionStorage:{getItem(){return ''},removeItem(){}},URL,URLSearchParams,Date,AbortSignal,setInterval(fn,ms){interval={fn,ms};}});
 vm.runInContext(readFileSync(new URL('../live.js',import.meta.url),'utf8'),context);
 vm.runInContext("token='test';identity={role:'reader'};data={state:{symbol:'XAUUSD',currency:'JPY',positions:[],candles:{M5:[{time:1000,open:2700,close:2701,low:2699,high:2702}]}},deals:[],online:true,received_at:Date.now()};render();",context);
 return {context,document,setResponse(fn){requestHandler=fn},get requestCount(){return requestCount},get box(){return box},get button(){return button},get renders(){return renders},get interval(){return interval}};
}

test('mobile chart follows latest, preserves manual scroll on refresh and resumes on demand',()=>{
 const a=app();assert.equal(a.box.scrollLeft,650);
 a.box.scrollLeft=120;a.box.onscroll();
 vm.runInContext('render()',a.context);assert.equal(a.box.scrollLeft,120);
 assert.equal(a.button.textContent,'Voltar à última vela');
 a.button.onclick();assert.equal(a.box.scrollLeft,650);
 a.box.scrollLeft=350;a.box.onscroll();
 vm.runInContext('render()',a.context);assert.equal(a.box.scrollLeft,650);
 assert.equal(a.button.textContent,'Acompanhando última vela');
});

test('polling do painel é agendado a cada 500ms',()=>{
 const a=app();
 assert.equal(a.interval.ms,500);
});

test('execution markers use directional arrows with tips at the execution price',()=>{
 const a=app();
 vm.runInContext("data.state={symbol:'XAUUSD',candles:{M5:[{time:1000,open:2700,close:2701,low:2699,high:2702}]}};data.deals=[{id:'1',entry:0,side:'BUY',price:2700,time:1001},{id:'2',entry:0,side:'SELL',price:2701,time:1002},{id:'3',entry:1,side:'SELL',price:2700,time:1003}];",a.context);
 const svg=vm.runInContext('candleView()',a.context);
 for(const direction of ['buy','sell','exit'])assert(svg.includes(`data-marker="${direction}"`));
 assert(!svg.includes('<circle'));assert.equal((svg.match(/<path /g)||[]).length,3);
});
