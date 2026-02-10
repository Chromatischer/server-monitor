import { createSignal } from 'solid-js';
import { authStore } from '../stores/auth';

export default function LoginPage() {
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await authStore.login(username(), password());
    if (!result.ok) {
      setError(result.error || 'Login failed');
    }
    setLoading(false);
  }

  return (
    <div class="bp-login">
      <div class="bp-login-card">
        <h1 class="bp-login-title">Monitor</h1>
        <p class="bp-login-subtitle">Sign in to your dashboard</p>

        <form class="bp-login-form" onSubmit={handleSubmit}>
          <div class="bp-login-field">
            <label class="bp-login-label">Username</label>
            <input
              type="text"
              class="bp-login-input"
              value={username()}
              onInput={(e) => setUsername(e.currentTarget.value)}
              autocomplete="username"
              autofocus
            />
          </div>

          <div class="bp-login-field">
            <label class="bp-login-label">Password</label>
            <input
              type="password"
              class="bp-login-input"
              value={password()}
              onInput={(e) => setPassword(e.currentTarget.value)}
              autocomplete="current-password"
            />
          </div>

          {error() && <div class="bp-login-error">{error()}</div>}

          <button
            type="submit"
            class="bp-login-submit"
            disabled={loading() || !username() || !password()}
          >
            {loading() ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
