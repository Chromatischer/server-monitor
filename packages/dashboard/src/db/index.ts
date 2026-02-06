import { Database } from 'bun:sqlite';
import { SCHEMA } from './schema';
import { DEFAULT_SETTINGS } from '@monitor/shared';
import type { Server, Container, Metric, Alert, Site, Node, Command } from '@monitor/shared';

const DB_PATH = process.env.DB_PATH || 'monitor.db';

const db = new Database(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec(SCHEMA);

// --- Migration for existing DBs ---
try {
  db.exec('ALTER TABLE servers ADD COLUMN node_id TEXT REFERENCES nodes(id) ON DELETE SET NULL');
} catch {
  // Column already exists
}

// Migrate stale theme names to new default
const VALID_THEMES = new Set(['blueprint', 'carbon', 'amber', 'phosphor', 'frost']);
try {
  const currentTheme = db.prepare('SELECT value FROM settings WHERE key = ?').get('active_theme') as { value: string } | undefined;
  if (currentTheme && !VALID_THEMES.has(currentTheme.value)) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('blueprint', 'active_theme');
  }
} catch {
  // settings table may not exist yet
}

// Seed default settings
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
  insertSetting.run(key, value);
}

// --- Nodes ---

export function getAllNodes(): Node[] {
  return db.prepare('SELECT * FROM nodes ORDER BY name').all() as Node[];
}

export function getNode(id: string): Node | null {
  return (db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as Node) || null;
}

export function createNode(node: Node): void {
  db.prepare(
    'INSERT INTO nodes (id, name, description, location, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(node.id, node.name, node.description, node.location, node.created_at);
}

export function deleteNode(id: string): void {
  db.prepare('DELETE FROM nodes WHERE id = ?').run(id);
}

export function getServersByNode(nodeId: string): Server[] {
  return db.prepare('SELECT * FROM servers WHERE node_id = ? ORDER BY name').all(nodeId) as Server[];
}

// --- Servers ---

export function getAllServers(): Server[] {
  return db.prepare('SELECT * FROM servers ORDER BY name').all() as Server[];
}

export function getServer(id: string): Server | null {
  return (db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as Server) || null;
}

export function createServer(server: Server): void {
  db.prepare(
    'INSERT INTO servers (id, name, hostname, ip_address, agent_version, status, last_heartbeat, registered_at, metadata, node_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(server.id, server.name, server.hostname, server.ip_address, server.agent_version, server.status, server.last_heartbeat, server.registered_at, server.metadata, server.node_id);
}

export function updateServerHeartbeat(id: string, timestamp: number): void {
  db.prepare('UPDATE servers SET last_heartbeat = ?, status = ? WHERE id = ?').run(timestamp, 'online', id);
}

export function updateServerStatus(id: string, status: string): void {
  db.prepare('UPDATE servers SET status = ? WHERE id = ?').run(status, id);
}

export function updateServerNodeId(id: string, nodeId: string | null): void {
  db.prepare('UPDATE servers SET node_id = ? WHERE id = ?').run(nodeId, id);
}

export function deleteServer(id: string): void {
  db.prepare('DELETE FROM servers WHERE id = ?').run(id);
}

// --- Containers ---

export function getContainersByServer(serverId: string): Container[] {
  return db.prepare('SELECT * FROM containers WHERE server_id = ? ORDER BY name').all(serverId) as Container[];
}

export function upsertContainer(c: Container): void {
  db.prepare(`
    INSERT INTO containers (id, server_id, name, image, status, state, cpu_percent, memory_usage, memory_limit, network_rx, network_tx, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id, server_id) DO UPDATE SET
      name=excluded.name, image=excluded.image, status=excluded.status, state=excluded.state,
      cpu_percent=excluded.cpu_percent, memory_usage=excluded.memory_usage, memory_limit=excluded.memory_limit,
      network_rx=excluded.network_rx, network_tx=excluded.network_tx, last_updated=excluded.last_updated
  `).run(c.id, c.server_id, c.name, c.image, c.status, c.state, c.cpu_percent, c.memory_usage, c.memory_limit, c.network_rx, c.network_tx, c.last_updated);
}

export function removeStaleContainers(serverId: string, activeIds: string[]): void {
  if (activeIds.length === 0) {
    db.prepare('DELETE FROM containers WHERE server_id = ?').run(serverId);
    return;
  }
  const placeholders = activeIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM containers WHERE server_id = ? AND id NOT IN (${placeholders})`).run(serverId, ...activeIds);
}

// --- Metrics ---

export function insertMetric(m: Omit<Metric, 'id'>): void {
  db.prepare(
    'INSERT INTO metrics (server_id, timestamp, cpu_percent, memory_percent, disk_percent, container_count, container_running, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(m.server_id, m.timestamp, m.cpu_percent, m.memory_percent, m.disk_percent, m.container_count, m.container_running, m.payload);
}

export function getRecentMetrics(serverId: string, limit = 60): Metric[] {
  return db.prepare('SELECT * FROM metrics WHERE server_id = ? ORDER BY timestamp DESC LIMIT ?').all(serverId, limit) as Metric[];
}

export function pruneOldMetrics(olderThanMs: number): void {
  db.prepare('DELETE FROM metrics WHERE timestamp < ?').run(olderThanMs);
}

// --- Alerts ---

export function getAlerts(status?: string): Alert[] {
  if (status) {
    return db.prepare('SELECT * FROM alerts WHERE status = ? ORDER BY created_at DESC').all(status) as Alert[];
  }
  return db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 200').all() as Alert[];
}

export function getActiveAlertForServer(serverId: string, type: string): Alert | null {
  return (db.prepare('SELECT * FROM alerts WHERE server_id = ? AND type = ? AND status = ? LIMIT 1').get(serverId, type, 'active') as Alert) || null;
}

export function createAlert(alert: Omit<Alert, 'id'>): Alert {
  const result = db.prepare(
    'INSERT INTO alerts (server_id, container_id, type, message, severity, status, created_at, acknowledged_at, resolved_at, notified_discord) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(alert.server_id, alert.container_id, alert.type, alert.message, alert.severity, alert.status, alert.created_at, alert.acknowledged_at, alert.resolved_at, alert.notified_discord);
  return { ...alert, id: Number(result.lastInsertRowid) } as Alert;
}

export function acknowledgeAlert(id: number): void {
  db.prepare('UPDATE alerts SET status = ?, acknowledged_at = ? WHERE id = ?').run('acknowledged', Date.now(), id);
}

export function resolveAlert(id: number): void {
  db.prepare('UPDATE alerts SET status = ?, resolved_at = ? WHERE id = ?').run('resolved', Date.now(), id);
}

export function markAlertNotified(id: number): void {
  db.prepare('UPDATE alerts SET notified_discord = 1 WHERE id = ?').run(id);
}

// --- Settings ---

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// --- Sites ---

export function getAllSites(): Site[] {
  return db.prepare('SELECT * FROM sites ORDER BY name').all() as Site[];
}

export function getSitesByServer(serverId: string): Site[] {
  return db.prepare('SELECT * FROM sites WHERE server_id = ? ORDER BY name').all(serverId) as Site[];
}

export function upsertSite(site: Site): void {
  db.prepare(`
    INSERT INTO sites (id, server_id, name, url, status, response_time, last_checked, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      server_id=excluded.server_id, name=excluded.name, url=excluded.url,
      status=excluded.status, response_time=excluded.response_time,
      last_checked=excluded.last_checked
  `).run(site.id, site.server_id, site.name, site.url, site.status, site.response_time, site.last_checked, site.created_at);
}

export function deleteSite(id: string): void {
  db.prepare('DELETE FROM sites WHERE id = ?').run(id);
}

export function updateSiteStatus(id: string, status: string, responseTime: number | null): void {
  db.prepare('UPDATE sites SET status = ?, response_time = ?, last_checked = ? WHERE id = ?')
    .run(status, responseTime, Date.now(), id);
}

// --- Commands ---

export function createCommand(cmd: Command): void {
  db.prepare(
    'INSERT INTO commands (id, server_id, container_id, type, status, created_at, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(cmd.id, cmd.server_id, cmd.container_id, cmd.type, cmd.status, cmd.created_at, cmd.executed_at);
}

export function getPendingCommands(serverId: string): Command[] {
  return db.prepare('SELECT * FROM commands WHERE server_id = ? AND status = ? ORDER BY created_at').all(serverId, 'pending') as Command[];
}

export function updateCommandStatus(id: string, status: string, executedAt?: number): void {
  if (executedAt) {
    db.prepare('UPDATE commands SET status = ?, executed_at = ? WHERE id = ?').run(status, executedAt, id);
  } else {
    db.prepare('UPDATE commands SET status = ? WHERE id = ?').run(status, id);
  }
}

export function getCommand(id: string): Command | null {
  return (db.prepare('SELECT * FROM commands WHERE id = ?').get(id) as Command) || null;
}

// --- Seed Demo Data ---

function seedDemoData(): void {
  const existing = db.prepare('SELECT COUNT(*) as count FROM servers').get() as { count: number };
  if (existing.count > 0) return;

  const now = Date.now();
  const tenSecsAgo = now - 10_000;

  // 3 Nodes
  const nodes: Node[] = [
    { id: 'node-prod', name: 'Production Cluster', description: 'Main production infrastructure', location: 'US-East-1', created_at: now - 86400_000 * 30 },
    { id: 'node-dev', name: 'Development', description: 'Development and staging servers', location: 'Office', created_at: now - 86400_000 * 14 },
    { id: 'node-storage', name: 'Storage', description: 'Backup and storage infrastructure', location: 'US-West-2', created_at: now - 86400_000 * 60 },
  ];

  for (const n of nodes) createNode(n);

  // 5 servers assigned to nodes
  const servers: Server[] = [
    { id: 'srv-prod-web-01', name: 'prod-web-01', hostname: 'prod-web-01.internal', ip_address: '192.168.1.10', agent_version: '1.0.0', status: 'online', last_heartbeat: tenSecsAgo, registered_at: now - 86400_000 * 7, metadata: null, node_id: 'node-prod' },
    { id: 'srv-prod-db-01', name: 'prod-db-01', hostname: 'prod-db-01.internal', ip_address: '192.168.1.20', agent_version: '1.0.0', status: 'online', last_heartbeat: tenSecsAgo, registered_at: now - 86400_000 * 7, metadata: null, node_id: 'node-prod' },
    { id: 'srv-staging-01', name: 'staging-01', hostname: 'staging-01.internal', ip_address: '192.168.1.30', agent_version: '1.0.0', status: 'online', last_heartbeat: tenSecsAgo, registered_at: now - 86400_000 * 3, metadata: null, node_id: 'node-dev' },
    { id: 'srv-dev-box', name: 'dev-box', hostname: 'dev-box.local', ip_address: '192.168.1.50', agent_version: '1.0.0', status: 'degraded', last_heartbeat: tenSecsAgo, registered_at: now - 86400_000 * 14, metadata: null, node_id: 'node-dev' },
    { id: 'srv-backup-nas', name: 'backup-nas', hostname: 'backup-nas.internal', ip_address: '192.168.1.100', agent_version: '1.0.0', status: 'offline', last_heartbeat: now - 600_000, registered_at: now - 86400_000 * 30, metadata: null, node_id: 'node-storage' },
  ];

  for (const s of servers) createServer(s);

  // Containers
  const containers: Container[] = [
    // prod-web-01 (5 containers)
    { id: 'ctr-nginx', server_id: 'srv-prod-web-01', name: 'nginx-proxy', image: 'nginx:alpine', status: 'running', state: 'running', cpu_percent: 2.3, memory_usage: 67_108_864, memory_limit: 536_870_912, network_rx: 1_240_000, network_tx: 3_890_000, last_updated: tenSecsAgo },
    { id: 'ctr-openwebui', server_id: 'srv-prod-web-01', name: 'open-webui', image: 'ghcr.io/open-webui/open-webui:main', status: 'running', state: 'running', cpu_percent: 12.8, memory_usage: 524_288_000, memory_limit: 2_147_483_648, network_rx: 890_000, network_tx: 2_100_000, last_updated: tenSecsAgo },
    { id: 'ctr-portainer', server_id: 'srv-prod-web-01', name: 'portainer', image: 'portainer/portainer-ce:latest', status: 'running', state: 'running', cpu_percent: 1.1, memory_usage: 41_943_040, memory_limit: 268_435_456, network_rx: 120_000, network_tx: 340_000, last_updated: tenSecsAgo },
    { id: 'ctr-node-exp-1', server_id: 'srv-prod-web-01', name: 'node-exporter', image: 'prom/node-exporter:latest', status: 'running', state: 'running', cpu_percent: 0.5, memory_usage: 16_777_216, memory_limit: 134_217_728, network_rx: 45_000, network_tx: 89_000, last_updated: tenSecsAgo },
    { id: 'ctr-watchtower-1', server_id: 'srv-prod-web-01', name: 'watchtower', image: 'containrrr/watchtower:latest', status: 'running', state: 'running', cpu_percent: 0.2, memory_usage: 20_971_520, memory_limit: 134_217_728, network_rx: 12_000, network_tx: 8_000, last_updated: tenSecsAgo },

    // prod-db-01 (4 containers)
    { id: 'ctr-postgres', server_id: 'srv-prod-db-01', name: 'postgres', image: 'postgres:16-alpine', status: 'running', state: 'running', cpu_percent: 8.4, memory_usage: 1_073_741_824, memory_limit: 4_294_967_296, network_rx: 2_340_000, network_tx: 5_670_000, last_updated: tenSecsAgo },
    { id: 'ctr-redis', server_id: 'srv-prod-db-01', name: 'redis', image: 'redis:7-alpine', status: 'running', state: 'running', cpu_percent: 3.2, memory_usage: 134_217_728, memory_limit: 1_073_741_824, network_rx: 890_000, network_tx: 1_230_000, last_updated: tenSecsAgo },
    { id: 'ctr-pgadmin', server_id: 'srv-prod-db-01', name: 'pgadmin', image: 'dpage/pgadmin4:latest', status: 'running', state: 'running', cpu_percent: 1.7, memory_usage: 209_715_200, memory_limit: 536_870_912, network_rx: 67_000, network_tx: 234_000, last_updated: tenSecsAgo },
    { id: 'ctr-node-exp-2', server_id: 'srv-prod-db-01', name: 'node-exporter', image: 'prom/node-exporter:latest', status: 'running', state: 'running', cpu_percent: 0.4, memory_usage: 16_777_216, memory_limit: 134_217_728, network_rx: 45_000, network_tx: 89_000, last_updated: tenSecsAgo },

    // staging-01 (4 containers)
    { id: 'ctr-staging-app', server_id: 'srv-staging-01', name: 'staging-app', image: 'myapp:staging', status: 'running', state: 'running', cpu_percent: 5.6, memory_usage: 268_435_456, memory_limit: 1_073_741_824, network_rx: 340_000, network_tx: 890_000, last_updated: tenSecsAgo },
    { id: 'ctr-staging-db', server_id: 'srv-staging-01', name: 'staging-postgres', image: 'postgres:16-alpine', status: 'running', state: 'running', cpu_percent: 3.1, memory_usage: 268_435_456, memory_limit: 2_147_483_648, network_rx: 120_000, network_tx: 450_000, last_updated: tenSecsAgo },
    { id: 'ctr-staging-redis', server_id: 'srv-staging-01', name: 'staging-redis', image: 'redis:7-alpine', status: 'running', state: 'running', cpu_percent: 0.8, memory_usage: 33_554_432, memory_limit: 268_435_456, network_rx: 23_000, network_tx: 45_000, last_updated: tenSecsAgo },
    { id: 'ctr-nginx-stg', server_id: 'srv-staging-01', name: 'nginx-staging', image: 'nginx:alpine', status: 'running', state: 'running', cpu_percent: 1.2, memory_usage: 33_554_432, memory_limit: 268_435_456, network_rx: 67_000, network_tx: 190_000, last_updated: tenSecsAgo },

    // dev-box (5 containers - some issues)
    { id: 'ctr-grafana', server_id: 'srv-dev-box', name: 'grafana', image: 'grafana/grafana:latest', status: 'running', state: 'running', cpu_percent: 45.2, memory_usage: 536_870_912, memory_limit: 1_073_741_824, network_rx: 234_000, network_tx: 890_000, last_updated: tenSecsAgo },
    { id: 'ctr-prometheus', server_id: 'srv-dev-box', name: 'prometheus', image: 'prom/prometheus:latest', status: 'running', state: 'running', cpu_percent: 38.7, memory_usage: 805_306_368, memory_limit: 2_147_483_648, network_rx: 1_200_000, network_tx: 450_000, last_updated: tenSecsAgo },
    { id: 'ctr-gitlab', server_id: 'srv-dev-box', name: 'gitlab', image: 'gitlab/gitlab-ce:latest', status: 'running', state: 'running', cpu_percent: 22.4, memory_usage: 2_147_483_648, memory_limit: 4_294_967_296, network_rx: 890_000, network_tx: 1_230_000, last_updated: tenSecsAgo },
    { id: 'ctr-gitlab-runner', server_id: 'srv-dev-box', name: 'gitlab-runner', image: 'gitlab/gitlab-runner:latest', status: 'running', state: 'running', cpu_percent: 15.3, memory_usage: 268_435_456, memory_limit: 1_073_741_824, network_rx: 340_000, network_tx: 560_000, last_updated: tenSecsAgo },
    { id: 'ctr-dev-ollama', server_id: 'srv-dev-box', name: 'ollama', image: 'ollama/ollama:latest', status: 'stopped', state: 'exited', cpu_percent: 0, memory_usage: 0, memory_limit: 8_589_934_592, network_rx: 0, network_tx: 0, last_updated: tenSecsAgo },

    // backup-nas (2 containers - all stopped)
    { id: 'ctr-syncthing', server_id: 'srv-backup-nas', name: 'syncthing', image: 'syncthing/syncthing:latest', status: 'stopped', state: 'exited', cpu_percent: 0, memory_usage: 0, memory_limit: 536_870_912, network_rx: 0, network_tx: 0, last_updated: now - 600_000 },
    { id: 'ctr-duplicati', server_id: 'srv-backup-nas', name: 'duplicati', image: 'duplicati/duplicati:latest', status: 'stopped', state: 'exited', cpu_percent: 0, memory_usage: 0, memory_limit: 536_870_912, network_rx: 0, network_tx: 0, last_updated: now - 600_000 },
  ];

  for (const c of containers) upsertContainer(c);

  // 7 Sites
  const sites: Site[] = [
    { id: 'site-openwebui', server_id: 'srv-prod-web-01', name: 'Open WebUI', url: 'http://192.168.1.10:3000', status: 'up', response_time: 142, last_checked: tenSecsAgo, created_at: now - 86400_000 * 5 },
    { id: 'site-portainer', server_id: 'srv-prod-web-01', name: 'Portainer', url: 'http://192.168.1.10:9443', status: 'up', response_time: 89, last_checked: tenSecsAgo, created_at: now - 86400_000 * 7 },
    { id: 'site-grafana', server_id: 'srv-dev-box', name: 'Grafana', url: 'http://192.168.1.50:3001', status: 'up', response_time: 234, last_checked: tenSecsAgo, created_at: now - 86400_000 * 10 },
    { id: 'site-prometheus', server_id: 'srv-dev-box', name: 'Prometheus', url: 'http://192.168.1.50:9090', status: 'up', response_time: 67, last_checked: tenSecsAgo, created_at: now - 86400_000 * 10 },
    { id: 'site-pgadmin', server_id: 'srv-prod-db-01', name: 'pgAdmin', url: 'http://192.168.1.20:5050', status: 'up', response_time: 178, last_checked: tenSecsAgo, created_at: now - 86400_000 * 6 },
    { id: 'site-staging-app', server_id: 'srv-staging-01', name: 'Staging App', url: 'http://192.168.1.30:8080', status: 'up', response_time: 312, last_checked: tenSecsAgo, created_at: now - 86400_000 * 2 },
    { id: 'site-gitlab', server_id: 'srv-dev-box', name: 'GitLab', url: 'http://192.168.1.50:8929', status: 'up', response_time: 456, last_checked: tenSecsAgo, created_at: now - 86400_000 * 14 },
  ];

  for (const s of sites) upsertSite(s);

  // 4 Alerts
  const alerts: Omit<Alert, 'id'>[] = [
    { server_id: 'srv-backup-nas', container_id: null, type: 'server_down', message: 'Server "backup-nas" (backup-nas.internal) is not responding', severity: 'critical', status: 'active', created_at: now - 600_000, acknowledged_at: null, resolved_at: null, notified_discord: 0 },
    { server_id: 'srv-dev-box', container_id: null, type: 'high_cpu', message: 'Server "dev-box" CPU usage is above 90%', severity: 'warning', status: 'active', created_at: now - 300_000, acknowledged_at: null, resolved_at: null, notified_discord: 0 },
    { server_id: 'srv-prod-web-01', container_id: null, type: 'high_memory', message: 'Server "prod-web-01" memory usage exceeded 90%', severity: 'warning', status: 'resolved', created_at: now - 7200_000, acknowledged_at: null, resolved_at: now - 3600_000, notified_discord: 1 },
    { server_id: 'srv-staging-01', container_id: 'ctr-staging-app', type: 'container_stopped', message: 'Container "staging-app" stopped unexpectedly', severity: 'warning', status: 'acknowledged', created_at: now - 1800_000, acknowledged_at: now - 900_000, resolved_at: null, notified_discord: 1 },
  ];

  for (const a of alerts) createAlert(a);

  // Metrics history (~30 snapshots per online server, last 5 minutes)
  const onlineServers = ['srv-prod-web-01', 'srv-prod-db-01', 'srv-staging-01'];
  const cpuBases: Record<string, number> = { 'srv-prod-web-01': 18, 'srv-prod-db-01': 14, 'srv-staging-01': 10 };
  const memBases: Record<string, number> = { 'srv-prod-web-01': 52, 'srv-prod-db-01': 45, 'srv-staging-01': 35 };
  const diskBases: Record<string, number> = { 'srv-prod-web-01': 62, 'srv-prod-db-01': 78, 'srv-staging-01': 41 };

  for (const sid of onlineServers) {
    for (let i = 0; i < 30; i++) {
      const ts = now - (30 - i) * 10_000;
      const jitter = Math.sin(i * 0.5) * 5 + Math.random() * 3;
      insertMetric({
        server_id: sid,
        timestamp: ts,
        cpu_percent: Math.max(0, Math.min(100, cpuBases[sid] + jitter)),
        memory_percent: Math.max(0, Math.min(100, memBases[sid] + jitter * 0.5)),
        disk_percent: diskBases[sid],
        container_count: containers.filter(c => c.server_id === sid).length,
        container_running: containers.filter(c => c.server_id === sid && c.status === 'running').length,
        payload: null,
      });
    }
  }

  // dev-box metrics (higher CPU)
  for (let i = 0; i < 30; i++) {
    const ts = now - (30 - i) * 10_000;
    const jitter = Math.sin(i * 0.3) * 8 + Math.random() * 5;
    insertMetric({
      server_id: 'srv-dev-box',
      timestamp: ts,
      cpu_percent: Math.max(0, Math.min(100, 72 + jitter)),
      memory_percent: Math.max(0, Math.min(100, 68 + jitter * 0.4)),
      disk_percent: 55,
      container_count: 5,
      container_running: 4,
      payload: null,
    });
  }

  console.log('[Seed] Demo data inserted: 3 nodes, 5 servers, 20 containers, 7 sites, 4 alerts, 120 metrics');
}

seedDemoData();

export { db };
