import { Elysia, t } from 'elysia';
import {
  validateAdminCredentials,
  createUserSession,
  destroySession,
  validateSession,
  getSessionTokenFromCookie,
  buildSessionCookie,
  buildClearSessionCookie,
} from '../services/auth';
import { getApiKey } from '../db';

export const authRoutes = new Elysia({ prefix: '/api/auth' })
  .post('/login', ({ body, set, request }) => {
    const { username, password } = body;

    if (!validateAdminCredentials(username, password)) {
      set.status = 401;
      return { error: 'Invalid credentials' };
    }

    const { token, expiresAt } = createUserSession(username);
    set.headers['Set-Cookie'] = buildSessionCookie(token, expiresAt);
    return { ok: true, username };
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    }),
  })

  .post('/logout', ({ request, set }) => {
    const cookie = request.headers.get('cookie') || undefined;
    const token = getSessionTokenFromCookie(cookie);
    if (token) {
      destroySession(token);
    }
    set.headers['Set-Cookie'] = buildClearSessionCookie();
    return { ok: true };
  })

  .get('/check', ({ request, set }) => {
    const cookie = request.headers.get('cookie') || undefined;
    const token = getSessionTokenFromCookie(cookie);
    if (!token || !validateSession(token)) {
      set.status = 401;
      return { authenticated: false };
    }
    return { authenticated: true };
  })

  .get('/api-key', ({ request, set }) => {
    // Protected: only accessible with valid session
    const cookie = request.headers.get('cookie') || undefined;
    const token = getSessionTokenFromCookie(cookie);
    if (!token || !validateSession(token)) {
      set.status = 401;
      return { error: 'Unauthorized' };
    }
    return { apiKey: getApiKey() };
  });
