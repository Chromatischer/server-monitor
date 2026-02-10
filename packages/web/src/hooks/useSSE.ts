import { onCleanup, onMount } from 'solid-js';
import { authStore } from '../stores/auth';

type SSEHandler = (event: string, data: any) => void;

export function useSSE(handler: SSEHandler) {
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;

  function connect() {
    // Pre-check: if not authenticated, don't try to connect
    if (!authStore.authenticated()) return;

    eventSource = new EventSource('/api/sse');

    eventSource.onopen = () => {
      reconnectDelay = 1000;
    };

    eventSource.onerror = () => {
      eventSource?.close();

      // If we get an error, check if it's an auth issue
      // EventSource doesn't expose HTTP status, so verify auth is still valid
      fetch('/api/auth/check').then(res => {
        if (res.status === 401 || (res.ok && res.json().then(d => !d.authenticated))) {
          authStore.handleUnauthorized();
          return;
        }
        // Not an auth issue, reconnect with backoff
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          connect();
        }, reconnectDelay);
      }).catch(() => {
        // Network error, try reconnecting
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          connect();
        }, reconnectDelay);
      });
    };

    const events = ['server:update', 'container:update', 'alert:new', 'alert:resolved', 'metrics:update', 'site:update', 'node:update', 'command:update'];
    for (const evt of events) {
      eventSource.addEventListener(evt, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          handler(evt, data);
        } catch {
          // ignore parse errors
        }
      });
    }
  }

  onMount(() => {
    connect();
  });

  onCleanup(() => {
    eventSource?.close();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  });
}
