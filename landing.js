'use strict';
(function(){
 var burger=document.getElementById('burger'),menu=document.getElementById('menu');
 function setMenu(open){
  if(!burger||!menu)return;
  menu.classList.toggle('open',open);
  burger.setAttribute('aria-expanded',open?'true':'false');
  burger.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
 }
 if(burger&&menu){
  burger.addEventListener('click',function(){setMenu(!menu.classList.contains('open'));});
  menu.addEventListener('click',function(e){if(e.target.closest('a'))setMenu(false);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&menu.classList.contains('open')){setMenu(false);burger.focus();}});
  window.addEventListener('resize',function(){if(window.innerWidth>860)setMenu(false);});
 }
 var year=document.getElementById('ano');
 if(year)year.textContent=String(new Date().getFullYear());
})();
