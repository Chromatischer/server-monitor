import { getSetting, markAlertNotified } from '../db';
import { SEVERITY_COLORS } from '@monitor/shared';
import type { Alert, Server } from '@monitor/shared';

interface QueueItem {
  alert: Alert;
  server: Server | null;
  isRecovery: boolean;
}

const queue: QueueItem[] = [];
let processing = false;
let backoffMs = 0;

export function enqueueDiscordAlert(alert: Alert, server: Server | null, isRecovery = false): void {
  const enabled = getSetting('discord_enabled');
  const url = getSetting('discord_webhook_url');
  if (enabled !== 'true' || !url) return;
  queue.push({ alert, server, isRecovery });
  if (!processing) processQueue();
}

async function processQueue(): Promise<void> {
  processing = true;
  while (queue.length > 0) {
    if (backoffMs > 0) {
      await sleep(backoffMs);
      backoffMs = 0;
    }
    const item = queue.shift()!;
    try {
      await sendWebhook(item);
      markAlertNotified(item.alert.id);
    } catch (err) {
      console.error('[Discord] Failed to send webhook:', err);
    }
    await sleep(2000); // 2s minimum between sends
  }
  processing = false;
}

async function sendWebhook(item: QueueItem): Promise<void> {
  const url = getSetting('discord_webhook_url');
  if (!url) return;

  const { alert, server, isRecovery } = item;
  const color = isRecovery ? SEVERITY_COLORS.recovery : SEVERITY_COLORS[alert.severity as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.warning;
  const title = isRecovery ? 'Recovered' : `Alert: ${alert.type.replace(/_/g, ' ').toUpperCase()}`;

  const embed = {
    title,
    description: alert.message,
    color,
    fields: [
      { name: 'Server', value: server?.name || alert.server_id || 'Unknown', inline: true },
      { name: 'Severity', value: alert.severity, inline: true },
      { name: 'Status', value: isRecovery ? 'Resolved' : alert.status, inline: true },
    ],
    timestamp: new Date(alert.created_at).toISOString(),
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (res.status === 429) {
    const retry = res.headers.get('Retry-After');
    backoffMs = retry ? parseInt(retry) * 1000 : 5000;
    queue.unshift(item); // re-queue
  } else if (!res.ok) {
    console.error(`[Discord] Webhook returned ${res.status}`);
  }
}

export async function testWebhook(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: 'Monitor Server - Test',
          description: 'Webhook is working correctly!',
          color: SEVERITY_COLORS.recovery,
          timestamp: new Date().toISOString(),
        }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
