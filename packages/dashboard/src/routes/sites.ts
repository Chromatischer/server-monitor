import { Elysia, t } from 'elysia';
import { getAllSites, getSitesByServer, upsertSite, deleteSite } from '../db';

export const siteRoutes = new Elysia({ prefix: '/api/sites' })
  .get('/', ({ query }) => {
    if (query.serverId) {
      return { sites: getSitesByServer(query.serverId) };
    }
    return { sites: getAllSites() };
  })

  .post('/', ({ body }) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    upsertSite({
      id,
      server_id: body.serverId,
      name: body.name,
      url: body.url,
      status: 'unknown',
      response_time: null,
      last_checked: null,
      created_at: now,
    });
    return { id };
  }, {
    body: t.Object({
      serverId: t.String(),
      name: t.String(),
      url: t.String(),
    }),
  })

  .delete('/:id', ({ params }) => {
    deleteSite(params.id);
    return { ok: true };
  });
