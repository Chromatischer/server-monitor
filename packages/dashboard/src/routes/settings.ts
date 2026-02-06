import { Elysia, t } from 'elysia';
import { getAllSettings, setSetting } from '../db';
import { restartMonitor } from '../services/monitor';
import { testWebhook } from '../services/discord';

export const settingsRoutes = new Elysia({ prefix: '/api/settings' })
  .get('/', () => {
    return { settings: getAllSettings() };
  })

  .put('/', ({ body }) => {
    setSetting(body.key, body.value);

    // Restart monitor if timing settings changed
    if (body.key === 'heartbeat_timeout_seconds' || body.key === 'check_interval_seconds') {
      restartMonitor();
    }

    return { ok: true };
  }, {
    body: t.Object({
      key: t.String(),
      value: t.String(),
    }),
  })

  .post('/test-webhook', async ({ body }) => {
    const success = await testWebhook(body.url);
    return { success };
  }, {
    body: t.Object({
      url: t.String(),
    }),
  });
