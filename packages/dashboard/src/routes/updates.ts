import { Elysia } from 'elysia';
import { getUpdateStatus, checkForUpdates, applyUpdate } from '../services/updater';

export const updateRoutes = new Elysia({ prefix: '/api/updates' })
  /** Get current update status */
  .get('/', () => {
    return getUpdateStatus();
  })

  /** Check for updates (fetch from remote, compare commits) */
  .post('/check', async () => {
    const status = await checkForUpdates();
    return status;
  })

  /** Apply pending update (pull, install, build, restart) */
  .post('/apply', async () => {
    const status = await applyUpdate();
    return status;
  });
