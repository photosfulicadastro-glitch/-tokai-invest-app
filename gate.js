'use strict';
// Visitantes sem sessão que abrem o endereço raiz veem a página institucional.
// O aplicativo (login, cadastro, convites, PWA instalado) continua funcionando como antes.
(function(){try{
 if(location.hash||/[?&]app=/.test(location.search))return;
 if(!/\/(index\.html)?$/.test(location.pathname))return;
 var standalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;
 if(standalone)return;
 try{if(sessionStorage.getItem('tokai.session'))return;}catch(e){}
 location.replace(new URL('landing.html',location.href).href);
}catch(e){}})();
