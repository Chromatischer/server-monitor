export interface Node {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  created_at: number;
}

export type NodeStatus = 'online' | 'degraded' | 'offline';

export interface Server {
  id: string;
  name: string;
  hostname: string;
  ip_address: string | null;
  agent_version: string | null;
  status: ServerStatus;
  last_heartbeat: number | null;
  registered_at: number;
  metadata: string | null;
  node_id: string | null;
}

export interface Container {
  id: string;
  server_id: string;
  name: string;
  image: string | null;
  status: ContainerStatus;
  state: string | null;
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  network_rx: number;
  network_tx: number;
  last_updated: number | null;
}

export interface Metric {
  id: number;
  server_id: string;
  timestamp: number;
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  container_count: number | null;
  container_running: number | null;
  payload: string | null;
}

export interface Alert {
  id: number;
  server_id: string | null;
  container_id: string | null;
  type: AlertType;
  message: string;
  severity: AlertSeverity;
  status: AlertStatus;
  created_at: number;
  acknowledged_at: number | null;
  resolved_at: number | null;
  notified_discord: number;
}

export interface Command {
  id: string;
  server_id: string;
  container_id: string | null;
  type: CommandType;
  status: CommandStatus;
  created_at: number;
  executed_at: number | null;
}

export type CommandType = 'restart_server' | 'restart_container';
export type CommandStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface MetricsResponse {
  ok: boolean;
  commands?: Command[];
}

export type ServerStatus = 'online' | 'offline' | 'degraded' | 'unknown';
export type ContainerStatus = 'running' | 'stopped' | 'restarting' | 'paused' | 'exited' | 'created' | 'removing' | 'dead';
export type AlertType = 'server_down' | 'container_stopped' | 'high_cpu' | 'high_memory';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface RegisterRequest {
  name: string;
  hostname: string;
  ip?: string;
  agentVersion?: string;
}

export interface RegisterResponse {
  id: string;
  checkInterval: number;
}

export interface MetricsPayload {
  serverId: string;
  timestamp: number;
  system: {
    cpuPercent: number;
    memoryPercent: number;
    diskPercent: number;
  };
  containers: ContainerPayload[];
}

export interface ContainerPayload {
  id: string;
  name: string;
  image: string;
  status: string;
  state?: string;
  cpu: number;
  memory: number;
  memoryLimit: number;
  networkRx: number;
  networkTx: number;
}

export interface Site {
  id: string;
  server_id: string;
  name: string;
  url: string;
  status: SiteStatus;
  response_time: number | null;
  last_checked: number | null;
  created_at: number;
}

export type SiteStatus = 'up' | 'down' | 'unknown';

export interface SSEEvent {
  event: 'server:update' | 'container:update' | 'alert:new' | 'alert:resolved' | 'metrics:update' | 'site:update' | 'node:update' | 'command:update';
  data: unknown;
}

export type ThemeName = 'frost-1';
