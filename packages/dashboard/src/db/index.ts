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

export { db };
