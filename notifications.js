'use strict';
window.tokaiPush=(()=>{
 let enabled=false,message='',busy=false,registration=null;
 const supported=()=> 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
 const ios=()=>/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 async function worker(){if(!registration){registration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});await navigator.serviceWorker.ready;}return registration;}
 const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function html(){return `<section class="alert"><b>Alertas no celular</b><p>Receba entradas e fechamentos do XAUUSD mesmo com o painel fechado.</p><div class="tools"><button id="push-enable" ${busy?'disabled':''}>${enabled?'Reativar notificações':'Ativar notificações'}</button>${enabled?'<button id="push-test">Testar notificação</button><button id="push-disable">Desativar neste aparelho</button>':''}</div><p class="sub" role="status">${escape(message)||'No iPhone: abra no Safari, toque em Compartilhar → Adicionar à Tela de Início e abra pelo ícone. Requer iOS 16.4 ou posterior.'}</p></section>`;}
 function bind(api,render){
  document.getElementById('push-enable')?.addEventListener('click',async()=>{
   if(busy)return;
   if(ios()&&!standalone()){message='No iPhone, adicione à Tela de Início pelo Safari e abra pelo ícone para ativar.';render();return;}
   if(!supported()){message='Este navegador não oferece notificações. Abra no Safari do iPhone instalado ou no Chrome do Android.';render();return;}
   busy=true;
   try{
    // The permission request remains directly inside the user's click gesture.
    const permission=await Notification.requestPermission();
    if(permission!=='granted')throw Error('Permissão não concedida. Libere as notificações nas configurações do navegador/aplicativo.');
    const reg=await worker();const {publicKey}=await api('/v1/push/key');
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(publicKey)});
    await api('/v1/push/subscribe',{subscription:sub.toJSON()});enabled=true;message='Ativadas neste aparelho. Use “Testar notificação” para verificar o recebimento.';
   }catch(e){message=e.message;}finally{busy=false;render();}
  });
  document.getElementById('push-test')?.addEventListener('click',async()=>{if(busy)return;busy=true;try{const sub=await (await worker()).pushManager.getSubscription();await api('/v1/push/test',{endpoint:sub?.endpoint});message='Teste enviado ao serviço do celular. Confira se a notificação chegou.';}catch(e){message=e.message;}finally{busy=false;render();}});
  document.getElementById('push-disable')?.addEventListener('click',async()=>{if(busy)return;busy=true;try{await disable(api);message='Notificações desativadas neste aparelho.';}catch(e){message=e.message;}finally{busy=false;render();}});
 }
 async function disable(api){if(!supported())return;const reg=await navigator.serviceWorker.getRegistration('./');const sub=await reg?.pushManager.getSubscription();if(sub){await api('/v1/push/unsubscribe',{endpoint:sub.endpoint});await sub.unsubscribe();}enabled=false;}
 async function restore(api){enabled=false;if(!supported())return;const reg=await navigator.serviceWorker.getRegistration('./');const sub=await reg?.pushManager.getSubscription();if(sub&&Notification.permission==='granted'){await api('/v1/push/subscribe',{subscription:sub.toJSON()});enabled=true;}}
 return {html,bind,disable,restore};
})();
