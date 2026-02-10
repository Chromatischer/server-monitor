import { createSignal, createRoot } from 'solid-js';
import type { Alert } from '@monitor/shared';
import { authStore } from './auth';

function createAlertStore() {
  const [alerts, setAlerts] = createSignal<Alert[]>([]);

  async function fetchAlerts(status?: string) {
    try {
      const url = status ? `/api/alerts?status=${status}` : '/api/alerts';
      const res = await fetch(url);
      if (res.status === 401) { authStore.handleUnauthorized(); return; }
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  }

  async function acknowledgeAlert(id: number) {
    try {
      const res = await fetch(`/api/alerts/${id}/acknowledge`, { method: 'PUT' });
      if (res.status === 401) { authStore.handleUnauthorized(); return; }
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'acknowledged' as const, acknowledged_at: Date.now() } : a));
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  }

  function handleSSE(event: string, data: any) {
    if (event === 'alert:new') {
      setAlerts(prev => [data, ...prev]);
    }
    if (event === 'alert:resolved') {
      setAlerts(prev => prev.map(a => a.id === data.id ? { ...a, ...data } : a));
    }
  }

  function activeAlerts() {
    return alerts().filter(a => a.status === 'active');
  }

  return {
    alerts,
    activeAlerts,
    fetchAlerts,
    acknowledgeAlert,
    handleSSE,
  };
}

export const alertStore = createRoot(createAlertStore);
