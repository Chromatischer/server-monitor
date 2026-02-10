import type { MetricsPayload, RegisterRequest, RegisterResponse, MetricsResponse } from '@monitor/shared';

export class Reporter {
  private baseUrl: string;
  private apiKey: string | undefined;

  constructor(dashboardUrl: string, apiKey?: string) {
    this.baseUrl = dashboardUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  async register(info: RegisterRequest): Promise<RegisterResponse> {
    const res = await fetch(`${this.baseUrl}/api/servers/register`, {
      method: 'POST',
      headers: this.getHeaders(),
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
      headers: this.getHeaders(),
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
      headers: this.getHeaders(),
      body: JSON.stringify({ status }),
    });

    if (!res.ok) {
      console.error(`[Reporter] Command status update failed: ${res.status}`);
    }
  }
}
