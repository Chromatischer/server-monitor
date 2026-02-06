import { Elysia, t } from 'elysia';
import { getAllServers, getServer, createServer, deleteServer, getContainersByServer, getRecentMetrics, getSitesByServer, getAllNodes, createCommand, updateCommandStatus, getCommand, updateServerNodeId } from '../db';
import { getSetting } from '../db';
import { broadcast } from '../services/sse-bus';
import type { Command } from '@monitor/shared';

export const serverRoutes = new Elysia({ prefix: '/api/servers' })
  .post('/register', ({ body }) => {
    const existing = getAllServers().find(s => s.hostname === body.hostname);
    if (existing) {
      return { id: existing.id, checkInterval: parseInt(getSetting('check_interval_seconds') || '10', 10) };
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    createServer({
      id,
      name: body.name,
      hostname: body.hostname,
      ip_address: body.ip || null,
      agent_version: body.agentVersion || null,
      status: 'online',
      last_heartbeat: now,
      registered_at: now,
      metadata: null,
      node_id: null,
    });

    const server = getServer(id)!;
    broadcast('server:update', server);

    return {
      id,
      checkInterval: parseInt(getSetting('check_interval_seconds') || '10', 10),
    };
  }, {
    body: t.Object({
      name: t.String(),
      hostname: t.String(),
      ip: t.Optional(t.String()),
      agentVersion: t.Optional(t.String()),
    }),
  })

  .get('/', () => {
    return { servers: getAllServers(), nodes: getAllNodes() };
  })

  .get('/:id', ({ params }) => {
    const server = getServer(params.id);
    if (!server) return { error: 'Server not found' };
    const containers = getContainersByServer(params.id);
    const sites = getSitesByServer(params.id);
    const recentMetrics = getRecentMetrics(params.id, 60);
    return { server, containers, sites, recentMetrics };
  })

  .put('/:id', ({ params, body }) => {
    const server = getServer(params.id);
    if (!server) return { error: 'Server not found' };
    if (body.node_id !== undefined) {
      updateServerNodeId(params.id, body.node_id);
    }
    const updated = getServer(params.id)!;
    broadcast('server:update', updated);
    return updated;
  }, {
    body: t.Object({
      node_id: t.Optional(t.Union([t.String(), t.Null()])),
    }),
  })

  .delete('/:id', ({ params }) => {
    deleteServer(params.id);
    broadcast('server:update', { id: params.id, deleted: true });
    return { ok: true };
  })

  .post('/:id/restart', ({ params }) => {
    const server = getServer(params.id);
    if (!server) return { error: 'Server not found' };

    const cmd: Command = {
      id: `cmd-${crypto.randomUUID().substring(0, 8)}`,
      server_id: params.id,
      container_id: null,
      type: 'restart_server',
      status: 'pending',
      created_at: Date.now(),
      executed_at: null,
    };
    createCommand(cmd);
    broadcast('command:update', cmd);
    return cmd;
  })

  .post('/:id/containers/:containerId/restart', ({ params }) => {
    const server = getServer(params.id);
    if (!server) return { error: 'Server not found' };

    const cmd: Command = {
      id: `cmd-${crypto.randomUUID().substring(0, 8)}`,
      server_id: params.id,
      container_id: params.containerId,
      type: 'restart_container',
      status: 'pending',
      created_at: Date.now(),
      executed_at: null,
    };
    createCommand(cmd);
    broadcast('command:update', cmd);
    return cmd;
  });

export const commandRoutes = new Elysia({ prefix: '/api/commands' })
  .put('/:id', ({ params, body }) => {
    const cmd = getCommand(params.id);
    if (!cmd) return { error: 'Command not found' };
    updateCommandStatus(params.id, body.status, body.status === 'completed' || body.status === 'failed' ? Date.now() : undefined);
    const updated = getCommand(params.id)!;
    broadcast('command:update', updated);
    return updated;
  }, {
    body: t.Object({
      status: t.String(),
    }),
  });
