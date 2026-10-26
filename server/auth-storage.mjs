// Shared SQL works with PostgreSQL and SQLite; no plaintext credentials are stored.
export const authSchema=`
CREATE TABLE IF NOT EXISTS admin_credentials(id INTEGER PRIMARY KEY,password_hash TEXT NOT NULL,version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,version INTEGER NOT NULL,expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS signal_users (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 password_hash TEXT, status TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 invite_hash TEXT UNIQUE, invite_expires BIGINT, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS signal_sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES signal_users(id),
 user_version INTEGER NOT NULL, expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS signal_sessions_user ON signal_sessions(user_id);
CREATE INDEX IF NOT EXISTS signal_sessions_expiry ON signal_sessions(expires_at);
`;
export function authRepository(query){
 const one=async(sql,args=[]) => (await query(sql,args)).rows[0];
 return {
  adminPassword:()=>one('SELECT * FROM admin_credentials WHERE id=1'),
  setAdminPassword:password=>query('INSERT INTO admin_credentials(id,password_hash,version) VALUES(1,$1,1) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,version=admin_credentials.version+1',[password]),
  adminSession:(hash,version,expires)=>query('INSERT INTO admin_sessions(token_hash,version,expires_at) VALUES($1,$2,$3)',[hash,version,expires]),
  resolveAdmin:(hash,now)=>one('SELECT s.token_hash FROM admin_sessions s JOIN admin_credentials a ON a.version=s.version WHERE s.token_hash=$1 AND s.expires_at>$2',[hash,now]),
  remove:async id=>{await query("UPDATE signal_users SET status='blocked',version=version+1 WHERE id=$1",[id]);await query('DELETE FROM signal_sessions WHERE user_id=$1',[id]);await query('DELETE FROM push_subscriptions WHERE user_id=$1',[id]);return one('DELETE FROM signal_users WHERE id=$1 RETURNING id',[id]);},
  list:async()=> (await query('SELECT id,username,display_name,status,created_at FROM signal_users ORDER BY created_at DESC LIMIT 500',[])).rows,
  find:username=>one('SELECT * FROM signal_users WHERE username=$1',[username]),
  invite:hash=>one("SELECT id FROM signal_users WHERE invite_hash=$1 AND status='invited'",[hash]),
  create:async u=>{try{return await one("INSERT INTO signal_users(id,username,display_name,status,invite_hash,invite_expires,created_at) VALUES($1,$2,$3,'invited',$4,$5,$6) RETURNING id",[u.id,u.username,u.name,u.hash,u.expires,u.now]);}catch(e){if(e.code==='23505'||e.code==='ERR_SQLITE_ERROR'&&/UNIQUE/.test(e.message))return null;throw e;}},
  redeem:(hash,password,now)=>one("UPDATE signal_users SET password_hash=$1,status='active',invite_hash=NULL,invite_expires=NULL,version=version+1 WHERE invite_hash=$2 AND status='invited' AND invite_expires>$3 RETURNING id,username,display_name,password_hash,version",[password,hash,now]),
  change:(id,status)=>one("UPDATE signal_users SET status=$1,version=version+1,invite_hash=NULL,invite_expires=NULL WHERE id=$2 AND (password_hash IS NOT NULL OR $1='blocked') RETURNING id",[status,id]),
  reset:(id,hash,expires)=>one("UPDATE signal_users SET status='invited',password_hash=NULL,invite_hash=$1,invite_expires=$2,version=version+1 WHERE id=$3 RETURNING id,username",[hash,expires,id]),
  session:(hash,user,expires)=>one("INSERT INTO signal_sessions(token_hash,user_id,user_version,expires_at) SELECT $1,id,version,$2 FROM signal_users WHERE id=$3 AND password_hash=$4 AND status='active' AND version=$5 RETURNING token_hash",[hash,expires,user.id,user.password_hash,user.version]),
  resolve:(hash,now)=>one("SELECT u.id,u.username,u.display_name FROM signal_sessions s JOIN signal_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.status='active' AND s.user_version=u.version",[hash,now]),
  logout:async hash=>{await query('DELETE FROM admin_sessions WHERE token_hash=$1',[hash]);await query('DELETE FROM signal_sessions WHERE token_hash=$1',[hash]);},
  cleanup:async now=>{await query('DELETE FROM admin_sessions WHERE expires_at<=$1',[now]);await query('DELETE FROM signal_sessions WHERE expires_at<=$1',[now]);}
 };
}
