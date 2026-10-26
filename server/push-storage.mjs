import {createHash} from 'node:crypto';
export const pushSchema=`
CREATE TABLE IF NOT EXISTS push_config(id INTEGER PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS push_subscriptions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,user_version INTEGER NOT NULL,body TEXT NOT NULL,created_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS push_sub_user ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS push_outbox(id TEXT PRIMARY KEY,subscription_id TEXT NOT NULL,body TEXT NOT NULL,expires BIGINT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_at BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS push_outbox_due ON push_outbox(next_at);
`;
export const endpointId=s=>createHash('sha256').update(s).digest('hex');
export function pushRepository(query){
 const one=async(s,a=[]) => (await query(s,a)).rows[0];
 return {
 async config(keys){await query('INSERT INTO push_config(id,body) VALUES(1,$1) ON CONFLICT(id) DO NOTHING',[JSON.stringify(keys)]);return JSON.parse((await one('SELECT body FROM push_config WHERE id=1')).body);},
 async subscribe(user,subscription,now){
  const id=endpointId(subscription.endpoint);const uid=user.role==='admin'?'admin':user.id;
  const version=user.role==='admin'?1:(await one("SELECT version FROM signal_users WHERE id=$1 AND status='active'",[uid]))?.version;
  if(!version)throw Error('Acesso indisponível');
  await query('DELETE FROM push_outbox WHERE subscription_id=$1',[id]);
  await query('INSERT INTO push_subscriptions(id,user_id,user_version,body,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,user_version=excluded.user_version,body=excluded.body,created_at=excluded.created_at',[id,uid,version,JSON.stringify(subscription),now]);return id;
 },
 async unsubscribe(user,endpoint){await query('DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2',[endpointId(endpoint),user.role==='admin'?'admin':user.id]);},
 async own(user,endpoint){return one('SELECT * FROM push_subscriptions WHERE id=$1 AND user_id=$2',[endpointId(endpoint),user.role==='admin'?'admin':user.id]);},
 async remove(id){await query('DELETE FROM push_subscriptions WHERE id=$1',[id]);await query('DELETE FROM push_outbox WHERE subscription_id=$1',[id]);},
 async pending(now){
  await query('DELETE FROM push_outbox WHERE expires<=$1 OR attempts>=5 OR subscription_id NOT IN (SELECT id FROM push_subscriptions)',[now]);
  return (await query("SELECT o.*,s.body AS subscription FROM push_outbox o JOIN push_subscriptions s ON s.id=o.subscription_id LEFT JOIN signal_users u ON u.id=s.user_id WHERE o.next_at<=$1 AND (s.user_id='admin' OR (u.status='active' AND u.version=s.user_version)) ORDER BY o.next_at LIMIT 20",[now])).rows;
 },
 async authorized(id){return one("SELECT s.id FROM push_subscriptions s LEFT JOIN signal_users u ON u.id=s.user_id WHERE s.id=$1 AND (s.user_id='admin' OR (u.status='active' AND u.version=s.user_version))",[id]);},
 done:id=>query('DELETE FROM push_outbox WHERE id=$1',[id]),
 retry:(id,now)=>query('UPDATE push_outbox SET attempts=attempts+1,next_at=$1 WHERE id=$2',[now+10000,id])
 };
}
// Runs in the same transaction as the snapshot and deal insert. No replay of historic signals.
export async function enqueueDeals(query,previous,s,newDeals,now){
 if(!previous||previous.push_synced!==true||s.deals.length>=500||s.observed_at-previous.observed_at>30||s.symbol!==previous.symbol||s.source!==previous.source)return;
 for(const d of newDeals){
  const label=['Entrada','Fechamento / saída parcial','Reversão','Fechamento por posição oposta'][d.entry];
  const body=JSON.stringify({title:`${label} · ${s.symbol}`,body:`${d.side==='BUY'?'Compra':'Venda'} · ${d.volume} lote · ${d.price}`,tag:`deal-${d.id}`});
  await query("INSERT INTO push_outbox(id,subscription_id,body,expires,next_at) SELECT $1 || ':' || s.id,s.id,$2,$3,$4 FROM push_subscriptions s LEFT JOIN signal_users u ON u.id=s.user_id WHERE s.user_id='admin' OR (u.status='active' AND u.version=s.user_version) ON CONFLICT(id) DO NOTHING",['deal-'+d.id,body,now+120000,now]);
 }
}
