import {
  getAllServers,
  getServer,
  updateServerStatus,
  getActiveAlertForServer,
  createAlert,
  resolveAlert,
  getSetting,
  getAllSites,
  updateSiteStatus,
} from '../db';
import { broadcast } from './sse-bus';
import { enqueueDiscordAlert } from './discord';
import type { Server, Site } from '@monitor/shared';

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startMonitor(): void {
  runCheck();
  const intervalSec = parseInt(getSetting('heartbeat_timeout_seconds') || '30', 10);
  intervalId = setInterval(runCheck, intervalSec * 1000);
  console.log(`[Monitor] Heartbeat checker running every ${intervalSec}s`);

  // Site health checks every 30 seconds
  checkSites();
  setInterval(checkSites, 30_000);
}

export function stopMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function restartMonitor(): void {
  stopMonitor();
  startMonitor();
}

function runCheck(): void {
  const servers = getAllServers();
  const timeoutMs = parseInt(getSetting('heartbeat_timeout_seconds') || '30', 10) * 1000;
  const now = Date.now();

  for (const server of servers) {
    if (server.status === 'online' && server.last_heartbeat) {
      const elapsed = now - server.last_heartbeat;
      if (elapsed > timeoutMs) {
        markServerOffline(server);
      }
    }
  }
}

function markServerOffline(server: Server): void {
  updateServerStatus(server.id, 'offline');

  const existing = getActiveAlertForServer(server.id, 'server_down');
  if (!existing) {
    const alert = createAlert({
      server_id: server.id,
      container_id: null,
      type: 'server_down',
      message: `Server "${server.name}" (${server.hostname}) is not responding`,
      severity: 'critical',
      status: 'active',
      created_at: Date.now(),
      acknowledged_at: null,
      resolved_at: null,
      notified_discord: 0,
    });

    broadcast('alert:new', alert);
    enqueueDiscordAlert(alert, server);
  }

  broadcast('server:update', { ...server, status: 'offline' });
}

async function checkSites(): Promise<void> {
  const sites = getAllSites();
  for (const site of sites) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const start = Date.now();
      const res = await fetch(site.url, { signal: controller.signal, redirect: 'follow' });
      clearTimeout(timeout);
      const elapsed = Date.now() - start;
      const newStatus = res.ok ? 'up' : 'down';

      if (site.status !== newStatus) {
        handleSiteStatusChange(site, newStatus);
      }

      updateSiteStatus(site.id, newStatus, elapsed);
      broadcast('site:update', { ...site, status: newStatus, response_time: elapsed, last_checked: Date.now() });
    } catch {
      if (site.status !== 'down') {
        handleSiteStatusChange(site, 'down');
      }
      updateSiteStatus(site.id, 'down', null);
      broadcast('site:update', { ...site, status: 'down', response_time: null, last_checked: Date.now() });
    }
  }
}

function handleSiteStatusChange(site: Site, newStatus: string): void {
  const server = getServer(site.server_id);
  if (!server) return;

  if (newStatus === 'down') {
    const alert = createAlert({
      server_id: site.server_id,
      container_id: null,
      type: 'server_down',
      message: `Site "${site.name}" (${site.url}) is not responding`,
      severity: 'warning',
      status: 'active',
      created_at: Date.now(),
      acknowledged_at: null,
      resolved_at: null,
      notified_discord: 0,
    });
    broadcast('alert:new', alert);
    enqueueDiscordAlert(alert, server);
  }
}

export function handleServerRecovery(serverId: string): void {
  const server = getServer(serverId);
  if (!server) return;

  const existingAlert = getActiveAlertForServer(serverId, 'server_down');
  if (existingAlert) {
    resolveAlert(existingAlert.id);
    const resolved = { ...existingAlert, status: 'resolved', resolved_at: Date.now() };
    broadcast('alert:resolved', resolved);
    enqueueDiscordAlert(resolved, server, true);
  }
}
