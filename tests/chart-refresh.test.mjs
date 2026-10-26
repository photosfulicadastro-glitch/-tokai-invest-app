import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function app(){
 let box,button,renders=0,interval;
 const generic={addEventListener(){}};
 const root={set innerHTML(value){this.html=value;renders++;box={scrollWidth:650,clientWidth:300,scrollLeft:0};button={setAttribute(){}};},get innerHTML(){return this.html;}};
 const document={hidden:false,addEventListener(){},querySelectorAll:()=>[],getElementById:id=>id==='root'?root:id==='candle-scroll'?(root.html.includes('candle-scroll')?box:null):id==='follow-candles'?button:generic};
 const context=vm.createContext({document,window:{TOKAI_API_URL:'https://example.com',history:{replaceState(){}},scrollTo(){}},location:{hash:'',pathname:'/',search:''},sessionStorage:{getItem(){return ''},removeItem(){}},URL,URLSearchParams,Date,AbortSignal,setInterval(fn,ms){interval={fn,ms};}});
 vm.runInContext(readFileSync(new URL('../live.js',import.meta.url),'utf8'),context);
 vm.runInContext("token='test';identity={role:'reader'};data={state:null,deals:[],online:true,received_at:Date.now()};render();",context);
 return {context,document,get box(){return box},get button(){return button},get renders(){return renders},get interval(){return interval}};
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

test('500ms polling skips unchanged DOM and never overlaps requests',async()=>{
 const a=app();assert.equal(a.interval.ms,500);
 let requests=0,resolve;
 a.context.fetch=()=>{requests++;return new Promise(r=>{resolve=r;});};
 const renders=a.renders;
 const first=vm.runInContext('refresh(false)',a.context);
 await vm.runInContext('refresh(false)',a.context);assert.equal(requests,1);
 resolve({ok:true,json:async()=>vm.runInContext('data',a.context)});
 await first;assert.equal(a.renders,renders);
 a.context.fetch=async()=>({ok:true,json:async()=>({state:null,deals:[],online:true,received_at:Date.now()+1000})});
 await vm.runInContext('refresh(false)',a.context);assert.equal(a.renders,renders+1);
 a.document.hidden=true;a.interval.fn();assert.equal(requests,1);
});
