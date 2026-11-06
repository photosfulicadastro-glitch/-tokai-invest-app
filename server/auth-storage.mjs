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
-- Existing users intentionally have no membership row and remain legacy-accessible.
CREATE TABLE IF NOT EXISTS signal_memberships (
 user_id TEXT PRIMARY KEY REFERENCES signal_users(id),
 plan_code TEXT NOT NULL,
 status TEXT NOT NULL,
 access_until BIGINT,
 updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS signal_memberships_expiry ON signal_memberships(access_until);
CREATE TABLE IF NOT EXISTS signal_terms_acceptances (
 user_id TEXT NOT NULL REFERENCES signal_users(id),
 terms_version TEXT NOT NULL,
 accepted_at BIGINT NOT NULL,
 PRIMARY KEY(user_id,terms_version)
);
CREATE INDEX IF NOT EXISTS signal_terms_acceptances_user ON signal_terms_acceptances(user_id);
CREATE TABLE IF NOT EXISTS signal_registrations (
 user_id TEXT PRIMARY KEY REFERENCES signal_users(id),
 requested_plan TEXT NOT NULL,
 mt5_account TEXT,
 broker_server TEXT,
 created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS signal_registrations_plan ON signal_registrations(requested_plan);
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
  remove:async id=>{await query("UPDATE signal_users SET status='blocked',version=version+1 WHERE id=$1",[id]);await query('DELETE FROM signal_sessions WHERE user_id=$1',[id]);await query('DELETE FROM push_subscriptions WHERE user_id=$1',[id]);await query('DELETE FROM copy_agent_events WHERE agent_id IN (SELECT id FROM copy_agents WHERE user_id=$1)',[id]);await query('DELETE FROM copy_licenses WHERE agent_id IN (SELECT id FROM copy_agents WHERE user_id=$1)',[id]);await query('DELETE FROM copy_agents WHERE user_id=$1',[id]);await query('DELETE FROM copy_memberships WHERE user_id=$1',[id]);await query('DELETE FROM signal_memberships WHERE user_id=$1',[id]);await query('DELETE FROM signal_terms_acceptances WHERE user_id=$1',[id]);await query('DELETE FROM signal_registrations WHERE user_id=$1',[id]);return one('DELETE FROM signal_users WHERE id=$1 RETURNING id',[id]);},
  list:async()=> (await query("SELECT u.id,u.username,u.display_name,u.status,u.created_at,m.plan_code,m.status AS membership_status,m.access_until,r.requested_plan,r.mt5_account AS requested_mt5_account,r.broker_server AS requested_broker_server,r.created_at AS registration_created_at,t.accepted_at AS terms_accepted_at,t.terms_version FROM signal_users u LEFT JOIN signal_memberships m ON m.user_id=u.id LEFT JOIN signal_registrations r ON r.user_id=u.id LEFT JOIN signal_terms_acceptances t ON t.user_id=u.id AND t.terms_version='signals-copy-risk-v2' ORDER BY u.created_at DESC LIMIT 500",[])).rows,
  find:username=>one('SELECT * FROM signal_users WHERE username=$1',[username]),
  invite:hash=>one("SELECT id FROM signal_users WHERE invite_hash=$1 AND status='invited'",[hash]),
  create:async u=>{try{const created=await one("INSERT INTO signal_users(id,username,display_name,status,invite_hash,invite_expires,created_at) VALUES($1,$2,$3,'invited',$4,$5,$6) RETURNING id",[u.id,u.username,u.name,u.hash,u.expires,u.now]);if(created)await query("INSERT INTO signal_memberships(user_id,plan_code,status,access_until,updated_at) VALUES($1,$2,'active',$3,$4)",[created.id,u.plan||'signals',u.accessUntil??null,u.now]);return created;}catch(e){if(e.code==='23505'||e.code==='ERR_SQLITE_ERROR'&&/UNIQUE/.test(e.message))return null;throw e;}},
  register:async u=>{try{const created=await one("INSERT INTO signal_users(id,username,display_name,password_hash,status,created_at) VALUES($1,$2,$3,$4,'pending',$5) RETURNING id",[u.id,u.username,u.name,u.passwordHash,u.now]);if(!created)return null;await query("INSERT INTO signal_memberships(user_id,plan_code,status,access_until,updated_at) VALUES($1,$2,'paused',NULL,$3)",[created.id,u.plan,u.now]);await query("INSERT INTO signal_registrations(user_id,requested_plan,mt5_account,broker_server,created_at) VALUES($1,$2,$3,$4,$5)",[created.id,u.plan,u.account,u.server,u.now]);return created;}catch(e){if(e.code==='23505'||e.code==='ERR_SQLITE_ERROR'&&/UNIQUE/.test(e.message))return null;throw e;}},
  acceptTerms:(id,version,acceptedAt)=>query('INSERT INTO signal_terms_acceptances(user_id,terms_version,accepted_at) VALUES($1,$2,$3) ON CONFLICT(user_id,terms_version) DO NOTHING',[id,version,acceptedAt]),
  termsAccepted:async(id,version)=>!!(await one('SELECT user_id FROM signal_terms_acceptances WHERE user_id=$1 AND terms_version=$2',[id,version])),
  redeem:(hash,password,now)=>one("UPDATE signal_users SET password_hash=$1,status='active',invite_hash=NULL,invite_expires=NULL,version=version+1 WHERE invite_hash=$2 AND status='invited' AND invite_expires>$3 RETURNING id,username,display_name,password_hash,version",[password,hash,now]),
  change:(id,status)=>one("UPDATE signal_users SET status=$1,version=version+1,invite_hash=NULL,invite_expires=NULL WHERE id=$2 AND (password_hash IS NOT NULL OR $1='blocked') RETURNING id",[status,id]),
  reset:(id,hash,expires)=>one("UPDATE signal_users SET status='invited',password_hash=NULL,invite_hash=$1,invite_expires=$2,version=version+1 WHERE id=$3 RETURNING id,username",[hash,expires,id]),
  setMembership:async({id,plan,status,accessUntil,now})=>{const user=await one('SELECT id FROM signal_users WHERE id=$1',[id]);if(!user)return null;await query('INSERT INTO signal_memberships(user_id,plan_code,status,access_until,updated_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET plan_code=excluded.plan_code,status=excluded.status,access_until=excluded.access_until,updated_at=excluded.updated_at',[id,plan,status,accessUntil,now]);await query('UPDATE signal_users SET version=version+1 WHERE id=$1',[id]);await query('DELETE FROM signal_sessions WHERE user_id=$1',[id]);return one("SELECT u.id,u.username,u.display_name,u.status,u.created_at,m.plan_code,m.status AS membership_status,m.access_until FROM signal_users u JOIN signal_memberships m ON m.user_id=u.id WHERE u.id=$1",[id]);},
  session:(hash,user,expires,now)=>one("INSERT INTO signal_sessions(token_hash,user_id,user_version,expires_at) SELECT $1,u.id,u.version,$2 FROM signal_users u WHERE u.id=$3 AND u.password_hash=$4 AND u.status='active' AND u.version=$5 AND NOT EXISTS (SELECT 1 FROM signal_memberships m WHERE m.user_id=u.id AND (m.status<>'active' OR (m.access_until IS NOT NULL AND m.access_until<=$6))) RETURNING token_hash",[hash,expires,user.id,user.password_hash,user.version,now]),
  profile:id=>one("SELECT u.id,u.username,u.display_name,COALESCE(m.plan_code,'signals') AS plan_code FROM signal_users u LEFT JOIN signal_memberships m ON m.user_id=u.id WHERE u.id=$1",[id]),
  resolve:(hash,now)=>one("SELECT u.id,u.username,u.display_name,COALESCE(m.plan_code,'signals') AS plan_code FROM signal_sessions s JOIN signal_users u ON u.id=s.user_id LEFT JOIN signal_memberships m ON m.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.status='active' AND s.user_version=u.version AND NOT EXISTS (SELECT 1 FROM signal_memberships x WHERE x.user_id=u.id AND (x.status<>'active' OR (x.access_until IS NOT NULL AND x.access_until<=$2)))",[hash,now]),
  logout:async hash=>{await query('DELETE FROM admin_sessions WHERE token_hash=$1',[hash]);await query('DELETE FROM signal_sessions WHERE token_hash=$1',[hash]);},
  cleanup:async now=>{await query('DELETE FROM admin_sessions WHERE expires_at<=$1',[now]);await query('DELETE FROM signal_sessions WHERE expires_at<=$1',[now]);}
 };
}
