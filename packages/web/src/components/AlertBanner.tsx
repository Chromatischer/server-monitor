import { Show, For } from 'solid-js';
import { alertStore } from '../stores/alerts';

export default function AlertBanner() {
  const active = () => alertStore.activeAlerts();

  return (
    <Show when={active().length > 0}>
      <div class="bp-alert-banner">
        <span class="bp-alert-badge">!</span>
        <span class="bp-alert-text">
          {active().length} active alert{active().length > 1 ? 's' : ''}
          {active().length <= 3 && (
            <span>
              : <For each={active().slice(0, 3)}>
                {(alert, i) => (
                  <span>
                    {i() > 0 && ', '}
                    {alert.message}
                  </span>
                )}
              </For>
            </span>
          )}
        </span>
        <For each={active().slice(0, 3)}>
          {(alert) => (
            <button
              class="bp-alert-ack-btn"
              onClick={() => alertStore.acknowledgeAlert(alert.id)}
            >
              Ack
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}
