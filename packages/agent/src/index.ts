import { Reporter } from './reporter';
import { collectContainers, restartContainer } from './collectors/docker';
import { collectSystemInfo } from './collectors/system';
import { AGENT_VERSION } from '@monitor/shared';
import type { Command } from '@monitor/shared';
import { hostname } from 'os';

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:3000';
const SERVER_NAME = process.env.SERVER_NAME || hostname();

const reporter = new Reporter(DASHBOARD_URL);

let serverId: string | null = null;
let checkInterval = 10;
let running = true;

async function executeCommand(cmd: Command) {
  console.log(`[Agent] Executing command: ${cmd.type} (${cmd.id})`);
  try {
    await reporter.reportCommandStatus(cmd.id, 'running');

    if (cmd.type === 'restart_server') {
      console.log('[Agent] Server restart requested - agent will exit for supervisor restart');
      await reporter.reportCommandStatus(cmd.id, 'completed');
      process.exit(0);
    }

    if (cmd.type === 'restart_container' && cmd.container_id) {
      await restartContainer(cmd.container_id);
      await reporter.reportCommandStatus(cmd.id, 'completed');
      console.log(`[Agent] Container ${cmd.container_id} restarted`);
    }
  } catch (err) {
    console.error(`[Agent] Command ${cmd.id} failed:`, (err as Error).message);
    await reporter.reportCommandStatus(cmd.id, 'failed').catch(() => {});
  }
}

async function start() {
  console.log(`[Agent] Starting agent for "${SERVER_NAME}"`);
  console.log(`[Agent] Dashboard URL: ${DASHBOARD_URL}`);

  // Register with dashboard
  while (!serverId && running) {
    try {
      const result = await reporter.register({
        name: SERVER_NAME,
        hostname: hostname(),
        agentVersion: AGENT_VERSION,
      });
      serverId = result.id;
      checkInterval = result.checkInterval;
      console.log(`[Agent] Registered as ${serverId}, interval: ${checkInterval}s`);
    } catch (err) {
      console.error('[Agent] Registration failed, retrying in 5s:', (err as Error).message);
      await sleep(5000);
    }
  }

  // Collection loop
  while (running) {
    try {
      const [system, containers] = await Promise.all([
        collectSystemInfo(),
        collectContainers(),
      ]);

      const response = await reporter.sendMetrics({
        serverId: serverId!,
        timestamp: Date.now(),
        system: {
          cpuPercent: system.cpuPercent,
          memoryPercent: system.memoryPercent,
          diskPercent: system.diskPercent,
        },
        containers,
      });

      console.log(`[Agent] Reported: cpu=${system.cpuPercent}%, mem=${system.memoryPercent}%, containers=${containers.length}`);

      // Process pending commands
      if (response.commands && response.commands.length > 0) {
        for (const cmd of response.commands) {
          await executeCommand(cmd);
        }
      }
    } catch (err) {
      console.error('[Agent] Collection/report error:', (err as Error).message);
    }

    await sleep(checkInterval * 1000);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Agent] Shutting down...');
  running = false;
});
process.on('SIGTERM', () => {
  console.log('[Agent] Shutting down...');
  running = false;
});

start().catch(err => {
  console.error('[Agent] Fatal error:', err);
  process.exit(1);
});
