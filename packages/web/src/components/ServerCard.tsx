import type { Server } from '@monitor/shared';

const statusColors: Record<string, string> = {
  online: '#22c55e',
  offline: '#ef4444',
  degraded: '#f59e0b',
  unknown: '#6b7280',
};

interface Props {
  server: Server;
  onClick?: () => void;
  style?: Record<string, string>;
}

export default function ServerCard(props: Props) {
  const timeSince = () => {
    if (!props.server.last_heartbeat) return 'Never';
    const diff = Date.now() - props.server.last_heartbeat;
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  return (
    <div
      onClick={props.onClick}
      style={{
        cursor: props.onClick ? 'pointer' : 'default',
        ...props.style,
      }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '4px' }}>
        <div style={{
          width: '8px',
          height: '8px',
          'border-radius': '50%',
          background: statusColors[props.server.status] || '#6b7280',
          'box-shadow': props.server.status === 'online' ? `0 0 8px ${statusColors.online}` : 'none',
        }} />
        <span style={{ 'font-weight': '600', 'font-size': '14px' }}>{props.server.name}</span>
      </div>
      <div style={{ 'font-size': '12px', opacity: '0.6' }}>
        {props.server.hostname} &middot; {timeSince()}
      </div>
    </div>
  );
}
