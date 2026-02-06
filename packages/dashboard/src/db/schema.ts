export const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  location TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  ip_address TEXT,
  agent_version TEXT,
  status TEXT DEFAULT 'unknown',
  last_heartbeat INTEGER,
  registered_at INTEGER,
  metadata TEXT,
  node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS containers (
  id TEXT NOT NULL,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image TEXT,
  status TEXT,
  state TEXT,
  cpu_percent REAL DEFAULT 0,
  memory_usage INTEGER DEFAULT 0,
  memory_limit INTEGER DEFAULT 0,
  network_rx INTEGER DEFAULT 0,
  network_tx INTEGER DEFAULT 0,
  last_updated INTEGER,
  PRIMARY KEY (id, server_id)
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  timestamp INTEGER NOT NULL,
  cpu_percent REAL,
  memory_percent REAL,
  disk_percent REAL,
  container_count INTEGER,
  container_running INTEGER,
  payload TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
  container_id TEXT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT DEFAULT 'warning',
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  acknowledged_at INTEGER,
  resolved_at INTEGER,
  notified_discord INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'unknown',
  response_time INTEGER,
  last_checked INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  container_id TEXT,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  executed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_metrics_server_time ON metrics(server_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_containers_server ON containers(server_id);
CREATE INDEX IF NOT EXISTS idx_sites_server ON sites(server_id);
CREATE INDEX IF NOT EXISTS idx_commands_server_pending ON commands(server_id, status);
CREATE INDEX IF NOT EXISTS idx_servers_node ON servers(node_id);
`;
