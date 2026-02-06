import { Elysia, t } from 'elysia';
import {
  updateServerHeartbeat,
  upsertContainer,
  removeStaleContainers,
  insertMetric,
  getServer,
  getPendingCommands,
} from '../db';
import { broadcast } from '../services/sse-bus';
import { handleServerRecovery } from '../services/monitor';
import type { Container } from '@monitor/shared';

export const metricRoutes = new Elysia({ prefix: '/api/metrics' })
  .post('/', ({ body }) => {
    const { serverId, timestamp, system, containers } = body;

    const server = getServer(serverId);
    if (!server) return { error: 'Server not found' };

    // If server was offline, handle recovery
    if (server.status === 'offline') {
      handleServerRecovery(serverId);
    }

    // Update heartbeat
    updateServerHeartbeat(serverId, timestamp);

    // Upsert containers
    const containerIds: string[] = [];
    for (const c of containers) {
      containerIds.push(c.id);
      const container: Container = {
        id: c.id,
        server_id: serverId,
        name: c.name,
        image: c.image,
        status: c.status as Container['status'],
        state: c.state || null,
        cpu_percent: c.cpu,
        memory_usage: c.memory,
        memory_limit: c.memoryLimit,
        network_rx: c.networkRx,
        network_tx: c.networkTx,
        last_updated: timestamp,
      };
      upsertContainer(container);
    }

    // Remove containers that no longer exist
    removeStaleContainers(serverId, containerIds);

    // Insert metric
    insertMetric({
      server_id: serverId,
      timestamp,
      cpu_percent: system.cpuPercent,
      memory_percent: system.memoryPercent,
      disk_percent: system.diskPercent,
      container_count: containers.length,
      container_running: containers.filter(c => c.status === 'running').length,
      payload: JSON.stringify(body),
    });

    // Broadcast updates
    const updatedServer = getServer(serverId);
    broadcast('server:update', updatedServer);
    broadcast('metrics:update', { serverId, system, containerCount: containers.length });
    broadcast('container:update', { serverId, containers });

    // Return pending commands for this server
    const commands = getPendingCommands(serverId);
    return { ok: true, commands };
  }, {
    body: t.Object({
      serverId: t.String(),
      timestamp: t.Number(),
      system: t.Object({
        cpuPercent: t.Number(),
        memoryPercent: t.Number(),
        diskPercent: t.Number(),
      }),
      containers: t.Array(t.Object({
        id: t.String(),
        name: t.String(),
        image: t.String(),
        status: t.String(),
        state: t.Optional(t.String()),
        cpu: t.Number(),
        memory: t.Number(),
        memoryLimit: t.Number(),
        networkRx: t.Number(),
        networkTx: t.Number(),
      })),
    }),
  });
