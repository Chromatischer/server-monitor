import { Elysia, t } from 'elysia';
import { getAllSettings, setSetting } from '../db';
import { restartMonitor } from '../services/monitor';
import { restartUpdater } from '../services/updater';
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

    // Restart updater if auto-update settings changed
    if (body.key === 'auto_update_enabled' || body.key === 'auto_update_interval_minutes') {
      restartUpdater();
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
