import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { serverRoutes, commandRoutes } from './routes/servers';
import { metricRoutes } from './routes/metrics';
import { alertRoutes } from './routes/alerts';
import { settingsRoutes } from './routes/settings';
import { sseRoutes } from './routes/sse';
import { siteRoutes } from './routes/sites';
import { nodeRoutes } from './routes/nodes';
import { updateRoutes } from './routes/updates';
import { authRoutes } from './routes/auth';
import { startMonitor } from './services/monitor';
import { startUpdater } from './services/updater';
import {
  isAuthConfigured,
  validateSession,
  validateAgentApiKey,
  getSessionTokenFromCookie,
  startSessionPruner,
} from './services/auth';
import { pruneOldMetrics, getApiKey } from './db';
import { resolve, extname } from 'path';
import { existsSync } from 'fs';

const PORT = parseInt(process.env.PORT || '3000', 10);
const STATIC_DIR = resolve(import.meta.dir, '../public');

// --- Auth startup validation ---
if (!isAuthConfigured()) {
  console.error('[Dashboard] WARNING: ADMIN_USERNAME and ADMIN_PASSWORD environment variables are not set.');
  console.error('[Dashboard] Authentication is DISABLED. Set these env vars to enable auth.');
  console.error('[Dashboard]   ADMIN_USERNAME=admin ADMIN_PASSWORD=<strong-password> bun run ...');
}

// Ensure API key is generated on first run
const apiKey = getApiKey();
console.log(`[Dashboard] Agent API key: ${apiKey}`);

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

// Auth paths that don't require authentication
const AUTH_EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/check']);

// Agent paths that require API key instead of session
const AGENT_PATHS = ['/api/servers/register', '/api/metrics', '/api/commands'];

function isAgentPath(path: string): boolean {
  return AGENT_PATHS.some(p => path === p || path.startsWith(p + '/'));
}

const app = new Elysia()
  .use(cors({
    credentials: true,
  }))
  // Auth routes (no middleware needed - they handle their own auth)
  .use(authRoutes)
  // Global auth middleware for /api/* routes
  .onBeforeHandle(({ request, set }) => {
    const url = new URL(request.url);
    const path = url.pathname;

    // Skip auth for non-API routes (static files, SPA)
    if (!path.startsWith('/api/')) return;

    // Skip auth for exempt paths (login, check)
    if (AUTH_EXEMPT_PATHS.has(path)) return;

    // If auth is not configured, allow everything (dev mode)
    if (!isAuthConfigured()) return;

    // Agent paths: require API key
    if (isAgentPath(path)) {
      const authHeader = request.headers.get('authorization') || undefined;
      if (!validateAgentApiKey(authHeader)) {
        set.status = 401;
        return { error: 'Invalid or missing API key' };
      }
      return; // API key valid
    }

    // All other API routes: require session cookie
    const cookie = request.headers.get('cookie') || undefined;
    const token = getSessionTokenFromCookie(cookie);
    if (!token || !validateSession(token)) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
  })
  .use(serverRoutes)
  .use(commandRoutes)
  .use(metricRoutes)
  .use(alertRoutes)
  .use(settingsRoutes)
  .use(sseRoutes)
  .use(siteRoutes)
  .use(nodeRoutes)
  .use(updateRoutes)
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

// Start auto-updater
startUpdater();

// Start session cleanup
startSessionPruner();

console.log(`[Dashboard] Running at http://localhost:${PORT}`);

// Prune old metrics every hour (keep 24h)
setInterval(() => {
  pruneOldMetrics(Date.now() - 24 * 60 * 60 * 1000);
}, 60 * 60 * 1000);

export type App = typeof app;
