import { createSignal, createRoot } from 'solid-js';
import type { ThemeName } from '@monitor/shared';

function createSettingsStore() {
  const [settings, setSettings] = createSignal<Record<string, string>>({});
  const [activeTheme] = createSignal<ThemeName>('frost-1');
  const [settingsOpen, setSettingsOpen] = createSignal(false);

  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setSettings(data.settings || {});
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  }

  async function updateSetting(key: string, value: string) {
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      setSettings(prev => ({ ...prev, [key]: value }));
    } catch (err) {
      console.error('Failed to update setting:', err);
    }
  }

  async function testWebhook(url: string): Promise<boolean> {
    try {
      const res = await fetch('/api/settings/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      return data.success;
    } catch {
      return false;
    }
  }

  return {
    settings,
    activeTheme,
    settingsOpen,
    setSettingsOpen,
    fetchSettings,
    updateSetting,
    testWebhook,
  };
}

export const settingsStore = createRoot(createSettingsStore);
