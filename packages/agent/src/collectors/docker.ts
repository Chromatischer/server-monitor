import Docker from 'dockerode';
import type { ContainerPayload } from '@monitor/shared';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function collectContainers(): Promise<ContainerPayload[]> {
  try {
    const containers = await docker.listContainers({ all: true });
    const results: ContainerPayload[] = [];

    for (const info of containers) {
      const payload: ContainerPayload = {
        id: info.Id.substring(0, 12),
        name: (info.Names[0] || '').replace(/^\//, ''),
        image: info.Image,
        status: mapStatus(info.State),
        state: info.Status,
        cpu: 0,
        memory: 0,
        memoryLimit: 0,
        networkRx: 0,
        networkTx: 0,
      };

      // Only get stats for running containers
      if (info.State === 'running') {
        try {
          const container = docker.getContainer(info.Id);
          const stats = await container.stats({ stream: false }) as any;
          payload.cpu = calculateCpuPercent(stats);
          payload.memory = stats.memory_stats?.usage || 0;
          payload.memoryLimit = stats.memory_stats?.limit || 0;

          // Network stats
          if (stats.networks) {
            for (const net of Object.values(stats.networks) as any[]) {
              payload.networkRx += net.rx_bytes || 0;
              payload.networkTx += net.tx_bytes || 0;
            }
          }
        } catch {
          // Container may have stopped between list and stats
        }
      }

      results.push(payload);
    }

    return results;
  } catch (err) {
    console.error('[Docker] Collection failed:', err);
    return [];
  }
}

export async function restartContainer(id: string): Promise<void> {
  const container = docker.getContainer(id);
  await container.restart();
}

function calculateCpuPercent(stats: any): number {
  const cpuDelta = (stats.cpu_stats?.cpu_usage?.total_usage || 0) - (stats.precpu_stats?.cpu_usage?.total_usage || 0);
  const systemDelta = (stats.cpu_stats?.system_cpu_usage || 0) - (stats.precpu_stats?.system_cpu_usage || 0);
  const cpuCount = stats.cpu_stats?.online_cpus || 1;

  if (systemDelta > 0 && cpuDelta >= 0) {
    return Math.round((cpuDelta / systemDelta) * cpuCount * 100 * 100) / 100;
  }
  return 0;
}

function mapStatus(state: string): string {
  const map: Record<string, string> = {
    running: 'running',
    exited: 'exited',
    created: 'created',
    restarting: 'restarting',
    paused: 'paused',
    removing: 'removing',
    dead: 'dead',
  };
  return map[state] || 'stopped';
}
