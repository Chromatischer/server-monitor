import { onCleanup, onMount } from 'solid-js';

type SSEHandler = (event: string, data: any) => void;

export function useSSE(handler: SSEHandler) {
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;

  function connect() {
    eventSource = new EventSource('/api/sse');

    eventSource.onopen = () => {
      reconnectDelay = 1000;
    };

    eventSource.onerror = () => {
      eventSource?.close();
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        connect();
      }, reconnectDelay);
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
