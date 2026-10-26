import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('leitor vê somente quatro áreas; páginas administrativas e futuras ficam inacessíveis',()=>{
 const root={innerHTML:''},element={addEventListener(){}};
 const context=vm.createContext({document:{addEventListener(){},getElementById:id=>id==='root'?root:element,querySelectorAll:()=>[]},window:{TOKAI_API_URL:'https://tokai-invest-api.onrender.com',history:{replaceState(){}},scrollTo(){}},location:{hash:'',pathname:'/-tokai-invest-app/',origin:'https://photosfulicadastro-glitch.github.io',search:''},sessionStorage:{getItem(){return '';},removeItem(){}},URL,URLSearchParams,Date,AbortSignal,setInterval(){}});
 vm.runInContext(readFileSync(new URL('../live.js',import.meta.url),'utf8'),context);
 assert(root.innerHTML.includes('Nome de usuário'));assert(!root.innerHTML.includes('Explorar protótipo'));
 vm.runInContext("token='test';identity={role:'reader',name:'Leitor'};data={state:null,deals:[],online:false};render();",context);
 for(const label of ['Visão geral','Mercado','Operações','Histórico'])assert(root.innerHTML.includes(label));
 for(const label of ['Espelhamento','Minha conta','Conectar MT5','Acessos','Sinais manuais'])assert(!root.innerHTML.includes(label));
 for(const page of ['users','connect','copy','account','signals']){
  vm.runInContext(`page='${page}';render();`,context);assert.equal(vm.runInContext('page',context),'home');
 }
 vm.runInContext("identity={role:'admin'};page='users';adminUsers=[{id:'1',display_name:'<img src=x onerror=alert(1)>',username:'test',status:'active'}];render();",context);
 assert(root.innerHTML.includes('Convidar usuário'));assert(!root.innerHTML.includes('<img src=x'));assert(root.innerHTML.includes('&lt;img'));
});
test('convite abre ativação sem substituir window.history',()=>{
 const root={innerHTML:''},element={addEventListener(){}};let replaced=false;
 const context=vm.createContext({document:{addEventListener(){},getElementById:id=>id==='root'?root:element},location:{hash:'#convite='+'A'.repeat(43),pathname:'/-tokai-invest-app/',search:''},sessionStorage:{getItem(){return '';},removeItem(){}},URL,URLSearchParams,setInterval(){},history:{replaceState(){replaced=true;}}});
 vm.runInContext('window=this;',context);
 vm.runInContext(readFileSync(new URL('../live.js',import.meta.url),'utf8'),context);
 assert.equal(replaced,true);assert.match(root.innerHTML,/Ativar meu acesso/);assert.equal(vm.runInContext('typeof window.history.replaceState',context),'function');
});
