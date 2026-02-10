import type { ThemeName } from './types';

export const DEFAULT_CHECK_INTERVAL = 10;
export const DEFAULT_HEARTBEAT_TIMEOUT = 30;
export const DEFAULT_DASHBOARD_PORT = 3000;
export const DEFAULT_THEME: ThemeName = 'frost-1';

export const DEFAULT_SETTINGS: Record<string, string> = {
  discord_webhook_url: '',
  discord_enabled: 'false',
  check_interval_seconds: String(DEFAULT_CHECK_INTERVAL),
  heartbeat_timeout_seconds: String(DEFAULT_HEARTBEAT_TIMEOUT),
  active_theme: DEFAULT_THEME,
  alert_on_container_stop: 'true',
  high_cpu_threshold: '90',
  high_memory_threshold: '90',
  auto_update_enabled: 'false',
  auto_update_interval_minutes: '30',
};

export const AGENT_VERSION = '1.0.0';

export const SEVERITY_COLORS = {
  info: 0x3498db,
  warning: 0xf39c12,
  critical: 0xe74c3c,
  recovery: 0x2ecc71,
} as const;

export const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  offline: 'Offline',
  degraded: 'Degraded',
  unknown: 'Unknown',
  running: 'Running',
  stopped: 'Stopped',
  restarting: 'Restarting',
  paused: 'Paused',
  exited: 'Exited',
  created: 'Created',
  removing: 'Removing',
  dead: 'Dead',
};
