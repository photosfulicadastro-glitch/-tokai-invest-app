// Converte o que o admin cola (link ou ID do YouTube) em uma URL de embed segura.
const VIDEO=/^[A-Za-z0-9_-]{11}$/,CHANNEL=/^UC[A-Za-z0-9_-]{22}$/;
const PARAMS='autoplay=1&mute=1&rel=0&playsinline=1&modestbranding=1';
export function parseLiveSource(input){
 const raw=String(input||'').trim();
 if(!raw)return {error:'Cole o link da transmissão ou o ID do canal.'};
 if(VIDEO.test(raw))return {kind:'video',id:raw};
 if(CHANNEL.test(raw))return {kind:'channel',id:raw};
 let u;try{u=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw)}catch{return {error:'Link inválido.'}}
 const host=u.hostname.replace(/^(www|m)\./,'');
 if(host==='youtu.be'){const id=u.pathname.split('/')[1]||'';if(VIDEO.test(id))return {kind:'video',id}}
 else if(host==='youtube.com'||host==='youtube-nocookie.com'){
  const p=u.pathname.split('/').filter(Boolean);
  if(p[0]==='watch'&&VIDEO.test(u.searchParams.get('v')||''))return {kind:'video',id:u.searchParams.get('v')};
  if(['live','embed','shorts'].includes(p[0])&&VIDEO.test(p[1]||''))return {kind:'video',id:p[1]};
  if(p[0]==='channel'&&CHANNEL.test(p[1]||''))return {kind:'channel',id:p[1]};
  if(p[0]==='embed'&&p[1]==='live_stream'&&CHANNEL.test(u.searchParams.get('channel')||''))return {kind:'channel',id:u.searchParams.get('channel')};
  if((p[0]||'').startsWith('@')||p[0]==='c'||p[0]==='user')return {error:'Links com @nome não funcionam. Abra sua transmissão ao vivo e copie o link dela (youtube.com/watch?v=… ou youtube.com/live/…), ou use o link do canal no formato youtube.com/channel/UC….'};
 }
 return {error:'Não reconheci esse link. Use o link da transmissão ao vivo do YouTube.'};
}
export function embedUrl(src){
 if(!src||!src.id)return null;
 return src.kind==='channel'?`https://www.youtube-nocookie.com/embed/live_stream?channel=${src.id}&${PARAMS}`:`https://www.youtube-nocookie.com/embed/${src.id}?${PARAMS}`;
}
