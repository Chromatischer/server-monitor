import { readFileSync } from 'fs';
import { hostname, uptime } from 'os';

export interface SystemInfo {
  hostname: string;
  uptime: number;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
}

let prevCpuIdle = 0;
let prevCpuTotal = 0;

export async function collectSystemInfo(): Promise<SystemInfo> {
  return {
    hostname: hostname(),
    uptime: uptime(),
    cpuPercent: getCpuPercent(),
    memoryPercent: getMemoryPercent(),
    diskPercent: await getDiskPercent(),
  };
}

function getCpuPercent(): number {
  try {
    const stat = readFileSync('/proc/stat', 'utf-8');
    const line = stat.split('\n')[0]; // "cpu  user nice system idle ..."
    const parts = line.split(/\s+/).slice(1).map(Number);
    const idle = parts[3] + (parts[4] || 0); // idle + iowait
    const total = parts.reduce((a, b) => a + b, 0);

    const diffIdle = idle - prevCpuIdle;
    const diffTotal = total - prevCpuTotal;
    prevCpuIdle = idle;
    prevCpuTotal = total;

    if (diffTotal === 0) return 0;
    return Math.round((1 - diffIdle / diffTotal) * 100 * 100) / 100;
  } catch {
    return 0;
  }
}

function getMemoryPercent(): number {
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf-8');
    const lines: Record<string, number> = {};
    for (const line of meminfo.split('\n')) {
      const match = line.match(/^(\w+):\s+(\d+)/);
      if (match) lines[match[1]] = parseInt(match[2], 10);
    }
    const total = lines['MemTotal'] || 1;
    const available = lines['MemAvailable'] || 0;
    return Math.round((1 - available / total) * 100 * 100) / 100;
  } catch {
    return 0;
  }
}

async function getDiskPercent(): Promise<number> {
  try {
    const proc = Bun.spawn(['df', '-P', '/'], { stdout: 'pipe' });
    const text = await new Response(proc.stdout).text();
    const lines = text.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      const used = parseInt(parts[2], 10);
      const available = parseInt(parts[3], 10);
      if (used + available > 0) {
        return Math.round((used / (used + available)) * 100 * 100) / 100;
      }
    }
  } catch {
    // fallback
  }
  return 0;
}
