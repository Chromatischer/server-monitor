import { Elysia, t } from 'elysia';
import { getAllNodes, getNode, createNode, deleteNode, getServersByNode, getContainersByServer, getSitesByServer } from '../db';
import { broadcast } from '../services/sse-bus';
import type { Node } from '@monitor/shared';

export const nodeRoutes = new Elysia({ prefix: '/api/nodes' })
  .get('/', () => {
    return { nodes: getAllNodes() };
  })

  .get('/:id', ({ params }) => {
    const node = getNode(params.id);
    if (!node) return { error: 'Node not found' };
    const servers = getServersByNode(params.id);
    const serversWithChildren = servers.map(s => ({
      ...s,
      containers: getContainersByServer(s.id),
      sites: getSitesByServer(s.id),
    }));
    return { node, servers: serversWithChildren };
  })

  .post('/', ({ body }) => {
    const id = `node-${crypto.randomUUID().substring(0, 8)}`;
    const node: Node = {
      id,
      name: body.name,
      description: body.description || null,
      location: body.location || null,
      created_at: Date.now(),
    };
    createNode(node);
    broadcast('node:update', node);
    return node;
  }, {
    body: t.Object({
      name: t.String(),
      description: t.Optional(t.String()),
      location: t.Optional(t.String()),
    }),
  })

  .delete('/:id', ({ params }) => {
    deleteNode(params.id);
    broadcast('node:update', { id: params.id, deleted: true });
    return { ok: true };
  });
