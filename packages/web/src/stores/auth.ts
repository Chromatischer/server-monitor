import { createSignal, createRoot } from 'solid-js';

function createAuthStore() {
  const [authenticated, setAuthenticated] = createSignal(false);
  const [checking, setChecking] = createSignal(true);

  async function checkAuth(): Promise<boolean> {
    setChecking(true);
    try {
      const res = await fetch('/api/auth/check');
      if (res.ok) {
        const data = await res.json();
        setAuthenticated(data.authenticated === true);
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    }
    setChecking(false);
    return authenticated();
  }

  async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        setAuthenticated(true);
        return { ok: true };
      }

      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || 'Invalid credentials' };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }

  async function logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthenticated(false);
  }

  async function fetchApiKey(): Promise<string | null> {
    try {
      const res = await fetch('/api/auth/api-key');
      if (res.ok) {
        const data = await res.json();
        return data.apiKey || null;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /** Called by other stores/hooks when they receive a 401 */
  function handleUnauthorized() {
    setAuthenticated(false);
  }

  return {
    authenticated,
    checking,
    checkAuth,
    login,
    logout,
    fetchApiKey,
    handleUnauthorized,
  };
}

export const authStore = createRoot(createAuthStore);
