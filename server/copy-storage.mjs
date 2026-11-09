// Copy Trading persistence. MT5 passwords are never stored here.
export const copySchema=`
CREATE TABLE IF NOT EXISTS copy_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 execution_mode TEXT NOT NULL DEFAULT 'off',
 max_daily_loss_percent REAL NOT NULL DEFAULT 10,
 updated_at BIGINT NOT NULL DEFAULT 0
);
INSERT INTO copy_settings(id,execution_mode,max_daily_loss_percent,updated_at)
 VALUES(1,'off',10,0) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS copy_agents (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL UNIQUE REFERENCES signal_users(id),
 expected_account TEXT NOT NULL,
 broker_server TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending',
 daily_loss_percent REAL NOT NULL DEFAULT 10,
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 last_seen_at BIGINT,
 last_equity REAL,
 last_error TEXT
);
CREATE INDEX IF NOT EXISTS copy_agents_status ON copy_agents(status);
CREATE TABLE IF NOT EXISTS copy_memberships (
 user_id TEXT PRIMARY KEY REFERENCES signal_users(id),
 status TEXT NOT NULL DEFAULT 'paused',
 access_until BIGINT,
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS copy_memberships_status ON copy_memberships(status);
CREATE TABLE IF NOT EXISTS copy_licenses (
 id TEXT PRIMARY KEY,
 agent_id TEXT NOT NULL REFERENCES copy_agents(id),
 license_hash TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'issued',
 issued_at BIGINT NOT NULL,
 downloaded_at BIGINT,
 activated_at BIGINT,
 revoked_at BIGINT,
 terminal_fingerprint TEXT,
 last_seen_at BIGINT
);
CREATE INDEX IF NOT EXISTS copy_licenses_agent ON copy_licenses(agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS copy_licenses_current_agent ON copy_licenses(agent_id) WHERE status IN ('issued','active');
CREATE TABLE IF NOT EXISTS copy_agent_events (
 id TEXT PRIMARY KEY,
 agent_id TEXT NOT NULL REFERENCES copy_agents(id),
 license_id TEXT NOT NULL REFERENCES copy_licenses(id),
 event_type TEXT NOT NULL,
 master_position_id TEXT,
 copied_ticket TEXT,
 message TEXT NOT NULL,
 created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS copy_agent_events_recent ON copy_agent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS copy_agent_events_agent ON copy_agent_events(agent_id,created_at DESC);
`;
export function copyRepository(query){
 const one=async(sql,args=[])=>(await query(sql,args)).rows[0]||null;
 return {
  settings:()=>one('SELECT * FROM copy_settings WHERE id=1'),
  setSettings:({executionMode,maxDailyLossPercent,now})=>one('UPDATE copy_settings SET execution_mode=$1,max_daily_loss_percent=$2,updated_at=$3 WHERE id=1 RETURNING *',[executionMode,maxDailyLossPercent,now]),
  agentForUser:userId=>one('SELECT id,user_id,expected_account,broker_server,status,daily_loss_percent,created_at,updated_at,last_seen_at,last_equity,last_error FROM copy_agents WHERE user_id=$1',[userId]),
  copyMembership:userId=>one('SELECT user_id,status,access_until,created_at,updated_at FROM copy_memberships WHERE user_id=$1',[userId]),
  setCopyMembership:({userId,status,accessUntil,now})=>one("INSERT INTO copy_memberships(user_id,status,access_until,created_at,updated_at) VALUES($1,$2,$3,$4,$4) ON CONFLICT(user_id) DO UPDATE SET status=excluded.status,access_until=excluded.access_until,updated_at=excluded.updated_at RETURNING user_id,status,access_until,created_at,updated_at",[userId,status,accessUntil,now]),
  copyAccess:async(userId,now)=>!!(await one("SELECT user_id FROM copy_memberships WHERE user_id=$1 AND status='active' AND (access_until IS NULL OR access_until>=$2)",[userId,now])),
  agentByAccount:(account,server)=>one('SELECT id,user_id FROM copy_agents WHERE expected_account=$1 AND broker_server=$2',[account,server]),
  agentByToken:hash=>one('SELECT * FROM copy_agents WHERE token_hash=$1',[hash]),
  agentById:id=>one('SELECT id,user_id,expected_account,broker_server,status,daily_loss_percent,created_at,updated_at,last_seen_at,last_equity,last_error FROM copy_agents WHERE id=$1',[id]),
  createAgent:a=>one('INSERT INTO copy_agents(id,user_id,expected_account,broker_server,token_hash,status,daily_loss_percent,created_at,updated_at) VALUES($1,$2,$3,$4,$5,\'pending\',$6,$7,$7) RETURNING id,user_id,expected_account,broker_server,status,daily_loss_percent,created_at,updated_at',[a.id,a.userId,a.expectedAccount,a.brokerServer,a.tokenHash,a.dailyLossPercent,a.now]),
  setAgentLimit:({userId,dailyLossPercent,now})=>one('UPDATE copy_agents SET daily_loss_percent=$1,updated_at=$2 WHERE user_id=$3 RETURNING id,user_id,expected_account,broker_server,status,daily_loss_percent,updated_at,last_seen_at,last_equity,last_error',[dailyLossPercent,now,userId]),
  issueLicense:l=>one('INSERT INTO copy_licenses(id,agent_id,license_hash,status,issued_at) VALUES($1,$2,$3,\'issued\',$4) RETURNING id,status,issued_at',[l.id,l.agentId,l.licenseHash,l.now]),
  markLicenseDownloaded:({id,now})=>one("UPDATE copy_licenses SET downloaded_at=$1 WHERE id=$2 AND status='issued' RETURNING id,status,issued_at,downloaded_at",[now,id]),
  currentLicenseForAgent:agentId=>one("SELECT id,agent_id,status,issued_at,downloaded_at,activated_at,revoked_at,last_seen_at FROM copy_licenses WHERE agent_id=$1 AND status IN ('issued','active') ORDER BY issued_at DESC LIMIT 1",[agentId]),
  license:hash=>one("SELECT l.*,a.expected_account,a.broker_server,a.status AS agent_status,a.user_id,u.status AS user_status,a.daily_loss_percent,m.status AS membership_status,m.access_until AS membership_access_until FROM copy_licenses l JOIN copy_agents a ON a.id=l.agent_id JOIN signal_users u ON u.id=a.user_id LEFT JOIN copy_memberships m ON m.user_id=a.user_id WHERE l.license_hash=$1",[hash]),
  activateLicense:({id,fingerprint,now})=>one("UPDATE copy_licenses SET status='active',activated_at=$1,terminal_fingerprint=$2,last_seen_at=$1 WHERE id=$3 AND status='issued' RETURNING id,status,activated_at",[now,fingerprint,id]),
  revokeLicenses:async({agentId,now})=>{await query("UPDATE copy_licenses SET status='revoked',revoked_at=$1 WHERE agent_id=$2 AND status IN ('issued','active')",[now,agentId]);return true;},
  heartbeat:({id,status,equity,error,now})=>one('UPDATE copy_agents SET status=$1,last_equity=$2,last_error=$3,last_seen_at=$4,updated_at=$4 WHERE id=$5 RETURNING id',[status,equity,error,now,id]),
  recordEvent:e=>one('INSERT INTO copy_agent_events(id,agent_id,license_id,event_type,master_position_id,copied_ticket,message,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,agent_id,event_type,master_position_id,copied_ticket,message,created_at',[e.id,e.agentId,e.licenseId,e.eventType,e.masterPositionId||null,e.copiedTicket||null,e.message,e.now]),
  recentEvents:async(limit=80)=>(await query('SELECT id,agent_id,event_type,master_position_id,copied_ticket,message,created_at FROM copy_agent_events ORDER BY created_at DESC LIMIT $1',[limit])).rows,
  eventsForAgent:async(agentId,limit=30)=>(await query('SELECT id,agent_id,event_type,master_position_id,copied_ticket,message,created_at FROM copy_agent_events WHERE agent_id=$1 ORDER BY created_at DESC LIMIT $2',[agentId,limit])).rows
 };
}
