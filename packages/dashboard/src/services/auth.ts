import { createSession, getSession, deleteSession, validateApiKey, pruneExpiredSessions } from '../db';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// Admin credentials from env
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

export function validateAdminCredentials(username: string, password: string): boolean {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return false;
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export function createUserSession(username: string): { token: string; expiresAt: number } {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL;
  createSession(token, username, expiresAt);
  return { token, expiresAt };
}

export function validateSession(token: string | undefined): boolean {
  if (!token) return false;
  return getSession(token) !== null;
}

export function destroySession(token: string): void {
  deleteSession(token);
}

export function validateAgentApiKey(authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return validateApiKey(match[1]);
}

export function isAuthConfigured(): boolean {
  return Boolean(ADMIN_USERNAME && ADMIN_PASSWORD);
}

// Parse session token from cookie header
export function getSessionTokenFromCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)monitor_session=([^;]+)/);
  return match ? match[1] : undefined;
}

// Build Set-Cookie header value
export function buildSessionCookie(token: string, expiresAt: number): string {
  const expires = new Date(expiresAt).toUTCString();
  return `monitor_session=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

export function buildClearSessionCookie(): string {
  return 'monitor_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

// Prune expired sessions periodically
export function startSessionPruner(): void {
  setInterval(() => {
    pruneExpiredSessions();
  }, 60 * 60 * 1000); // Every hour
}
