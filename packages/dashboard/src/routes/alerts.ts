import { Elysia, t } from 'elysia';
import { getAlerts, acknowledgeAlert } from '../db';
import { broadcast } from '../services/sse-bus';

export const alertRoutes = new Elysia({ prefix: '/api/alerts' })
  .get('/', ({ query }) => {
    return { alerts: getAlerts(query.status) };
  }, {
    query: t.Object({
      status: t.Optional(t.String()),
    }),
  })

  .put('/:id/acknowledge', ({ params }) => {
    const id = parseInt(params.id, 10);
    acknowledgeAlert(id);
    broadcast('alert:resolved', { id, status: 'acknowledged' });
    return { ok: true };
  });
