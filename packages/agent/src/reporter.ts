import type { MetricsPayload, RegisterRequest, RegisterResponse, MetricsResponse } from '@monitor/shared';

export class Reporter {
  private baseUrl: string;

  constructor(dashboardUrl: string) {
    this.baseUrl = dashboardUrl.replace(/\/$/, '');
  }

  async register(info: RegisterRequest): Promise<RegisterResponse> {
    const res = await fetch(`${this.baseUrl}/api/servers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
    });

    if (!res.ok) {
      throw new Error(`Registration failed: ${res.status} ${await res.text()}`);
    }

    return res.json() as Promise<RegisterResponse>;
  }

  async sendMetrics(payload: MetricsPayload): Promise<MetricsResponse> {
    const res = await fetch(`${this.baseUrl}/api/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error(`[Reporter] Metrics POST failed: ${res.status}`);
      return { ok: false };
    }

    return res.json() as Promise<MetricsResponse>;
  }

  async reportCommandStatus(cmdId: string, status: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/commands/${cmdId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      console.error(`[Reporter] Command status update failed: ${res.status}`);
    }
  }
}
