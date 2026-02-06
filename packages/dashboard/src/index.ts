import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { serverRoutes, commandRoutes } from './routes/servers';
import { metricRoutes } from './routes/metrics';
import { alertRoutes } from './routes/alerts';
import { settingsRoutes } from './routes/settings';
import { sseRoutes } from './routes/sse';
import { siteRoutes } from './routes/sites';
import { nodeRoutes } from './routes/nodes';
import { startMonitor } from './services/monitor';
import { pruneOldMetrics } from './db';
import { resolve, extname } from 'path';
import { existsSync } from 'fs';

const PORT = parseInt(process.env.PORT || '3000', 10);
const STATIC_DIR = resolve(import.meta.dir, '../public');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const app = new Elysia()
  .use(cors())
  .use(serverRoutes)
  .use(commandRoutes)
  .use(metricRoutes)
  .use(alertRoutes)
  .use(settingsRoutes)
  .use(sseRoutes)
  .use(siteRoutes)
  .use(nodeRoutes)
  // Serve static files and SPA fallback
  .get('/*', ({ params, set }) => {
    const reqPath = (params as any)['*'] || '';

    // Don't serve static for API routes (already handled above)
    if (reqPath.startsWith('api/')) {
      set.status = 404;
      return 'Not Found';
    }

    // Try to serve static file
    const filePath = resolve(STATIC_DIR, reqPath);
    if (reqPath && existsSync(filePath) && !filePath.includes('..')) {
      const ext = extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      set.headers['Content-Type'] = mime;
      if (ext === '.js' || ext === '.css') {
        set.headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      }
      return Bun.file(filePath);
    }

    // SPA fallback: serve index.html
    const indexPath = resolve(STATIC_DIR, 'index.html');
    if (existsSync(indexPath)) {
      set.headers['Content-Type'] = 'text/html';
      return Bun.file(indexPath);
    }

    set.status = 404;
    return 'Not Found';
  })
  .listen(PORT);

// Start heartbeat monitor
startMonitor();

console.log(`[Dashboard] Running at http://localhost:${PORT}`);

// Prune old metrics every hour (keep 24h)
setInterval(() => {
  pruneOldMetrics(Date.now() - 24 * 60 * 60 * 1000);
}, 60 * 60 * 1000);

export type App = typeof app;
