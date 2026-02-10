import { createSignal, Show, onMount } from 'solid-js';
import { settingsStore } from '../stores/settings';
import { authStore } from '../stores/auth';

export default function SettingsPanel() {
  const [webhookUrl, setWebhookUrl] = createSignal('');
  const [testResult, setTestResult] = createSignal<string | null>(null);
  const [testing, setTesting] = createSignal(false);
  const [apiKey, setApiKey] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);

  const isOpen = () => settingsStore.settingsOpen();

  function init() {
    const s = settingsStore.settings();
    setWebhookUrl(s.discord_webhook_url || '');
    authStore.fetchApiKey().then(key => setApiKey(key));
  }

  async function handleTestWebhook() {
    setTesting(true);
    setTestResult(null);
    const success = await settingsStore.testWebhook(webhookUrl());
    setTestResult(success ? 'Webhook sent successfully!' : 'Failed to send webhook');
    setTesting(false);
  }

  async function handleCopyApiKey() {
    const key = apiKey();
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }

  return (
    <Show when={isOpen()}>
      <div class="bp-settings-panel">
        <div class="bp-settings-panel-backdrop" onClick={() => settingsStore.setSettingsOpen(false)} />
        <div class="bp-settings-panel-content" ref={() => init()}>
          <div class="bp-settings-header">
            <h2>Settings</h2>
            <button class="bp-settings-close" onClick={() => settingsStore.setSettingsOpen(false)}>&times;</button>
          </div>

          <section class="bp-settings-section">
            <h3>Security</h3>

            <Show when={apiKey()}>
              <label class="bp-settings-label">Agent API Key</label>
              <div class="bp-settings-apikey-row">
                <div class="bp-settings-apikey-value">{apiKey()}</div>
                <button class="bp-settings-copy-btn" onClick={handleCopyApiKey}>
                  {copied() ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p style={{ 'font-size': '11px', color: '#3e5868', 'margin-top': '6px', 'margin-bottom': '16px' }}>
                Use this key when installing agents with --api-key
              </p>
            </Show>

            <button class="bp-settings-logout-btn" onClick={() => authStore.logout()}>
              Sign out
            </button>
          </section>

          <section class="bp-settings-section">
            <h3>Discord Notifications</h3>

            <label class="bp-settings-label">Webhook URL</label>
            <input
              type="text"
              class="bp-settings-input"
              value={webhookUrl()}
              onInput={(e) => setWebhookUrl(e.currentTarget.value)}
              onBlur={() => settingsStore.updateSetting('discord_webhook_url', webhookUrl())}
              placeholder="https://discord.com/api/webhooks/..."
            />

            <div class="bp-settings-row">
              <button
                class="bp-settings-test-btn"
                onClick={handleTestWebhook}
                disabled={testing() || !webhookUrl()}
              >
                {testing() ? 'Sending...' : 'Test Webhook'}
              </button>

              <label class="bp-settings-checkbox">
                <input
                  type="checkbox"
                  checked={settingsStore.settings().discord_enabled === 'true'}
                  onChange={(e) => settingsStore.updateSetting('discord_enabled', String(e.currentTarget.checked))}
                />
                Enabled
              </label>
            </div>

            <Show when={testResult()}>
              <div class={`bp-settings-result ${testResult()?.includes('success') ? 'success' : 'error'}`}>
                {testResult()}
              </div>
            </Show>
          </section>

          <section class="bp-settings-section">
            <h3>Monitoring</h3>

            <label class="bp-settings-label">Check Interval (seconds)</label>
            <input
              type="number"
              class="bp-settings-input"
              value={settingsStore.settings().check_interval_seconds || '10'}
              onChange={(e) => settingsStore.updateSetting('check_interval_seconds', e.currentTarget.value)}
            />

            <label class="bp-settings-label">Heartbeat Timeout (seconds)</label>
            <input
              type="number"
              class="bp-settings-input"
              value={settingsStore.settings().heartbeat_timeout_seconds || '30'}
              onChange={(e) => settingsStore.updateSetting('heartbeat_timeout_seconds', e.currentTarget.value)}
            />

            <label class="bp-settings-checkbox">
              <input
                type="checkbox"
                checked={settingsStore.settings().alert_on_container_stop === 'true'}
                onChange={(e) => settingsStore.updateSetting('alert_on_container_stop', String(e.currentTarget.checked))}
              />
              Alert on container stop
            </label>
          </section>

          <section class="bp-settings-section">
            <h3>Thresholds</h3>

            <label class="bp-settings-label">High CPU Threshold (%)</label>
            <input
              type="number"
              class="bp-settings-input"
              value={settingsStore.settings().high_cpu_threshold || '90'}
              onChange={(e) => settingsStore.updateSetting('high_cpu_threshold', e.currentTarget.value)}
            />

            <label class="bp-settings-label">High Memory Threshold (%)</label>
            <input
              type="number"
              class="bp-settings-input"
              value={settingsStore.settings().high_memory_threshold || '90'}
              onChange={(e) => settingsStore.updateSetting('high_memory_threshold', e.currentTarget.value)}
            />
          </section>
        </div>
      </div>
    </Show>
  );
}
