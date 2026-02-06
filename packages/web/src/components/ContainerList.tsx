import { For, Show } from 'solid-js';
import type { Container } from '@monitor/shared';

const statusColors: Record<string, string> = {
  running: '#22c55e',
  stopped: '#ef4444',
  exited: '#ef4444',
  restarting: '#f59e0b',
  paused: '#f59e0b',
  created: '#6b7280',
  removing: '#6b7280',
  dead: '#ef4444',
};

interface Props {
  containers: Container[];
  compact?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function ContainerList(props: Props) {
  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: props.compact ? '4px' : '8px' }}>
      <Show when={props.containers.length === 0}>
        <div style={{ 'font-size': '12px', opacity: '0.5', 'font-style': 'italic' }}>No containers</div>
      </Show>
      <For each={props.containers}>
        {(container) => (
          <div style={{
            display: 'flex',
            'align-items': 'center',
            gap: '8px',
            padding: props.compact ? '4px 0' : '6px 8px',
            'border-radius': '6px',
            'font-size': props.compact ? '12px' : '13px',
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              'border-radius': '50%',
              background: statusColors[container.status] || '#6b7280',
              'flex-shrink': '0',
            }} />
            <span style={{ 'font-weight': '500', 'min-width': '0', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap', flex: '1' }}>
              {container.name}
            </span>
            <Show when={!props.compact}>
              <span style={{ opacity: '0.5', 'font-size': '11px', 'flex-shrink': '0' }}>
                {container.cpu_percent.toFixed(1)}% &middot; {formatBytes(container.memory_usage)}
              </span>
            </Show>
          </div>
        )}
      </For>
    </div>
  );
}
