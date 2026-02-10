import { createSignal, For, Show, onMount, onCleanup, Switch, Match } from 'solid-js';
import { serverStore } from '../../stores/servers';
import { settingsStore } from '../../stores/settings';
import { alertStore } from '../../stores/alerts';
import type { Server, Container, Site, Node, NodeStatus } from '@monitor/shared';
import './blueprint.css';

// ── Palette ──────────────────────────────────────────────────────────────

interface BPPalette {
  contour: [number, number, number];
  dashMajor: [number, number];
  dashMinor: [number, number];
  sigma: number;
  noise: number;
  speed: number;
  levels: number;
  gridStep: number;
  nodeStroke: [number, number, number];
  font: string;
}

const palette: BPPalette = {
  contour: [128, 208, 232],
  dashMajor: [14, 6],
  dashMinor: [1.5, 3.5],
  sigma: 2.5,
  noise: 0.08,
  speed: 0.35,
  levels: 14,
  gridStep: 28,
  nodeStroke: [128, 208, 232],
  font: 'Inter',
};

// ── Helpers ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function loadColor(pct: number): string {
  const blue: [number, number, number] = [59, 130, 246];
  const teal: [number, number, number] = [6, 182, 212];
  const orange: [number, number, number] = [245, 158, 11];
  const red: [number, number, number] = [239, 68, 68];
  if (pct <= 0.33) return lerpColor(blue, teal, pct / 0.33);
  if (pct <= 0.66) return lerpColor(teal, orange, (pct - 0.33) / 0.33);
  return lerpColor(orange, red, (pct - 0.66) / 0.34);
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

function peakColor(server: Server, containers: Container[]): string {
  if (server.status === 'offline') return '#ef4444';
  if (server.status === 'unknown') return '#6b7280';
  const running = containers.filter(c => c.status === 'running');
  if (running.length === 0) return '#3b82f6';
  const avg = running.reduce((s, c) => s + c.cpu_percent, 0) / running.length;
  return loadColor(Math.min(avg / 100, 1));
}

function avgCpu(containers: Container[]): number {
  const running = containers.filter(c => c.status === 'running');
  if (running.length === 0) return 0;
  return running.reduce((s, c) => s + c.cpu_percent, 0) / running.length;
}

function avgMem(containers: Container[]): number {
  const running = containers.filter(c => c.status === 'running');
  if (running.length === 0) return 0;
  const totalUsed = running.reduce((s, c) => s + c.memory_usage, 0);
  const totalLimit = running.reduce((s, c) => s + c.memory_limit, 0);
  if (totalLimit === 0) return 0;
  return (totalUsed / totalLimit) * 100;
}

function metricBarClass(pct: number): string {
  if (pct < 40) return 'low';
  if (pct < 75) return 'medium';
  return 'high';
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Layout Types ─────────────────────────────────────────────────────────

interface NodeRegion {
  node: Node;
  x: number;
  y: number;
  w: number;
  h: number;
  servers: PeakPos[];
  status: NodeStatus;
}

interface PeakPos {
  x: number;
  y: number;
  server: Server;
  containers: Container[];
  color: string;
  radius: number;
}

// ── Layout Computation ───────────────────────────────────────────────────

function computeLayout(
  nodes: Node[],
  servers: Server[],
  allContainers: Record<string, Container[]>,
  w: number,
  h: number,
): { regions: NodeRegion[]; orphans: PeakPos[] } {
  const margin = 80;
  const usableW = w - margin * 2;
  const usableH = h - margin * 2;

  const nodeServerMap: Record<string, Server[]> = {};
  const orphanServers: Server[] = [];

  for (const s of servers) {
    if (s.node_id && nodes.find(n => n.id === s.node_id)) {
      if (!nodeServerMap[s.node_id]) nodeServerMap[s.node_id] = [];
      nodeServerMap[s.node_id].push(s);
    } else {
      orphanServers.push(s);
    }
  }

  const activeNodes = nodes.filter(n => nodeServerMap[n.id]?.length);
  const totalRegions = activeNodes.length + (orphanServers.length > 0 ? 1 : 0);
  if (totalRegions === 0) return { regions: [], orphans: [] };

  const cols = Math.max(1, Math.ceil(Math.sqrt(totalRegions * (usableW / Math.max(usableH, 1)))));
  const rows = Math.max(1, Math.ceil(totalRegions / cols));
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  const pad = 30;

  const regions: NodeRegion[] = [];

  activeNodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rx = margin + col * cellW + pad;
    const ry = margin + row * cellH + pad;
    const rw = cellW - pad * 2;
    const rh = cellH - pad * 2;

    const nodeServers = nodeServerMap[node.id] || [];
    const srvCols = Math.max(1, Math.ceil(Math.sqrt(nodeServers.length)));
    const srvRows = Math.max(1, Math.ceil(nodeServers.length / srvCols));
    const sCellW = rw / srvCols;
    const sCellH = (rh - 20) / srvRows;

    const peakList: PeakPos[] = nodeServers.map((srv, si) => {
      const sc = si % srvCols;
      const sr = Math.floor(si / srvCols);
      const seed = hashStr(srv.id);
      const offX = ((seed % 31) / 31 - 0.5) * sCellW * 0.2;
      const offY = ((seed % 19) / 19 - 0.5) * sCellH * 0.2;
      const cx = rx + sCellW * (sc + 0.5) + offX;
      const cy = ry + 22 + sCellH * (sr + 0.5) + offY;
      const containers = allContainers[srv.id] || [];
      const ctrCount = Math.max(2, containers.length);
      const baseRadius = Math.min(sCellW, sCellH) * 0.25;
      const radius = Math.min(baseRadius, 18 + ctrCount * 6);
      return { x: cx, y: cy, server: srv, containers, color: peakColor(srv, containers), radius };
    });

    const nodeStatus = (() => {
      if (nodeServers.every(s => s.status === 'offline')) return 'offline' as NodeStatus;
      if (nodeServers.some(s => s.status === 'offline' || s.status === 'degraded')) return 'degraded' as NodeStatus;
      return 'online' as NodeStatus;
    })();

    regions.push({ node, x: rx, y: ry, w: rw, h: rh, servers: peakList, status: nodeStatus });
  });

  const orphanPeaks: PeakPos[] = [];
  if (orphanServers.length > 0) {
    const oi = activeNodes.length;
    const col = oi % cols;
    const row = Math.floor(oi / cols);
    const rx = margin + col * cellW + pad;
    const ry = margin + row * cellH + pad;
    const rw = cellW - pad * 2;
    const rh = cellH - pad * 2;

    const oCols = Math.max(1, Math.ceil(Math.sqrt(orphanServers.length)));
    const oRows = Math.max(1, Math.ceil(orphanServers.length / oCols));
    const oCellW = rw / oCols;
    const oCellH = rh / oRows;

    orphanServers.forEach((srv, si) => {
      const sc = si % oCols;
      const sr = Math.floor(si / oCols);
      const cx = rx + oCellW * (sc + 0.5);
      const cy = ry + oCellH * (sr + 0.5);
      const containers = allContainers[srv.id] || [];
      const ctrCount = Math.max(2, containers.length);
      const baseRadius = Math.min(oCellW, oCellH) * 0.25;
      const radius = Math.min(baseRadius, 18 + ctrCount * 6);
      orphanPeaks.push({ x: cx, y: cy, server: srv, containers, color: peakColor(srv, containers), radius });
    });
  }

  return { regions, orphans: orphanPeaks };
}

// ── Terrain ──────────────────────────────────────────────────────────────

function simpleNoise(x: number, y: number, t: number): number {
  const v1 = Math.sin(x * 0.008 + t * 0.07) * Math.cos(y * 0.006 - t * 0.05) * 0.5;
  const v2 = Math.sin((x + y) * 0.005 + t * 0.04) * 0.3;
  const v3 = Math.cos(x * 0.012 - y * 0.01 + t * 0.06) * 0.2;
  return v1 + v2 + v3;
}

function terrainHeight(x: number, y: number, t: number, allPeaks: PeakPos[], pal: BPPalette): number {
  let h = simpleNoise(x, y, t) * pal.noise;
  for (const peak of allPeaks) {
    const dx = x - peak.x;
    const dy = y - peak.y;
    const seed = hashStr(peak.server.id);
    const aspect = 0.85 + (seed % 30) / 100;
    const rot = (seed % 360) * Math.PI / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const rx = dx * cos + dy * sin;
    const ry = (-dx * sin + dy * cos) / aspect;
    const sigma = peak.radius * pal.sigma;
    const dist2 = rx * rx + ry * ry;
    const peakH = 0.3 + (peak.containers.length / 15) * 0.7;
    h += peakH * Math.exp(-dist2 / (2 * sigma * sigma));
  }
  return h;
}

// ── Detail Mode Types ────────────────────────────────────────────────────

type DetailMode =
  | { type: 'node'; node: Node }
  | { type: 'server'; server: Server }
  | { type: 'container'; container: Container; server: Server }
  | { type: 'site'; site: Site; server: Server };

// ── SVG Icon helpers ────────────────────────────────────────────────────

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function SetupIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export default function BlueprintDashboard() {
  let canvasRef: HTMLCanvasElement | undefined;
  let animFrameId = 0;

  const [detailMode, setDetailMode] = createSignal<DetailMode | null>(null);
  const [detailContainers, setDetailContainers] = createSignal<Container[]>([]);
  const [detailSites, setDetailSites] = createSignal<Site[]>([]);
  const [detailMetrics, setDetailMetrics] = createSignal<{ cpu: number; mem: number; disk: number }>({ cpu: 0, mem: 0, disk: 0 });
  const [hoveredTarget, setHoveredTarget] = createSignal<{ type: 'server'; peak: PeakPos } | { type: 'node'; region: NodeRegion } | null>(null);
  const [mousePos, setMousePos] = createSignal<{ x: number; y: number }>({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = createSignal<{ w: number; h: number }>({ w: 800, h: 600 });
  const [restarting, setRestarting] = createSignal<Record<string, boolean>>({});
  const [helpOpen, setHelpOpen] = createSignal(false);
  const [setupOpen, setSetupOpen] = createSignal(false);
  const [setupTab, setSetupTab] = createSignal<'node' | 'site'>('node');
  const [setupMsg, setSetupMsg] = createSignal<{ type: 'success' | 'error'; text: string; cli?: string } | null>(null);
  const [setupLoading, setSetupLoading] = createSignal(false);

  const servers = () => serverStore.servers();
  const allContainers = () => serverStore.containers();
  const allSites = () => serverStore.sites();
  const nodesList = () => serverStore.nodes();
  const onlineCount = () => servers().filter(s => s.status === 'online').length;
  const totalSites = () => serverStore.allSites().length;
  const sitesUp = () => serverStore.allSites().filter(s => s.status === 'up').length;

  const layout = () => computeLayout(nodesList(), servers(), allContainers(), canvasSize().w, canvasSize().h);
  const allPeaks = () => {
    const l = layout();
    const peaks: PeakPos[] = [];
    for (const r of l.regions) peaks.push(...r.servers);
    peaks.push(...l.orphans);
    return peaks;
  };

  function handleResize() {
    if (!canvasRef) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvasRef.getBoundingClientRect();
    canvasRef.width = rect.width * dpr;
    canvasRef.height = rect.height * dpr;
    setCanvasSize({ w: rect.width, h: rect.height });
  }

  function findTargetAt(mx: number, my: number): { type: 'server'; peak: PeakPos } | { type: 'node'; region: NodeRegion } | null {
    for (const p of allPeaks()) {
      const dx = mx - p.x;
      const dy = my - p.y;
      if (Math.sqrt(dx * dx + dy * dy) < p.radius + 12) return { type: 'server', peak: p };
    }
    for (const r of layout().regions) {
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        return { type: 'node', region: r };
      }
    }
    return null;
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setMousePos({ x: e.clientX, y: e.clientY });
    const target = findTargetAt(mx, my);
    setHoveredTarget(target);
    if (canvasRef) canvasRef.style.cursor = target ? 'pointer' : 'default';
  }

  function handleClick(e: MouseEvent) {
    if (!canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const target = findTargetAt(mx, my);
    if (target?.type === 'server') openServerDetail(target.peak.server);
    else if (target?.type === 'node') openNodeDetail(target.region.node);
  }

  async function openNodeDetail(node: Node) {
    setDetailMode({ type: 'node', node });
    const data = await serverStore.fetchNodeDetail(node.id);
    if (data?.servers) {
      const allCtrs: Container[] = [];
      const allSts: Site[] = [];
      for (const s of data.servers) {
        if (s.containers) allCtrs.push(...s.containers);
        if (s.sites) allSts.push(...s.sites);
      }
      setDetailContainers(allCtrs);
      setDetailSites(allSts);
      setDetailMetrics({
        cpu: avgCpu(allCtrs),
        mem: avgMem(allCtrs),
        disk: 0,
      });
    }
  }

  async function openServerDetail(server: Server) {
    setDetailMode({ type: 'server', server });
    const data = await serverStore.fetchServerDetail(server.id);
    if (data?.containers) setDetailContainers(data.containers);
    if (data?.sites) setDetailSites(data.sites);
    const cList = data?.containers || [];
    setDetailMetrics({
      cpu: avgCpu(cList),
      mem: avgMem(cList),
      disk: data?.recentMetrics?.[0]?.disk_percent ?? 0,
    });
  }

  function openContainerDetail(container: Container, server: Server) {
    setDetailMode({ type: 'container', container, server });
  }

  function openSiteDetail(site: Site, server: Server) {
    setDetailMode({ type: 'site', site, server });
  }

  function closeDetail() {
    setDetailMode(null);
    setDetailContainers([]);
    setDetailSites([]);
    setDetailMetrics({ cpu: 0, mem: 0, disk: 0 });
  }

  async function handleRestartServer(serverId: string) {
    setRestarting(prev => ({ ...prev, [serverId]: true }));
    await serverStore.restartServer(serverId);
    setTimeout(() => setRestarting(prev => ({ ...prev, [serverId]: false })), 3000);
  }

  async function handleRestartContainer(serverId: string, containerId: string) {
    setRestarting(prev => ({ ...prev, [containerId]: true }));
    await serverStore.restartContainer(serverId, containerId);
    setTimeout(() => setRestarting(prev => ({ ...prev, [containerId]: false })), 3000);
  }

  function findNodeForServer(serverId: string): Node | null {
    const srv = servers().find(s => s.id === serverId);
    if (!srv?.node_id) return null;
    return nodesList().find(n => n.id === srv.node_id) || null;
  }

  // ── Setup form handlers ──

  async function handleCreateNode(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const name = (fd.get('name') as string || '').trim();
    if (!name) return;
    setSetupLoading(true);
    setSetupMsg(null);
    try {
      const res = await fetch('/api/nodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: (fd.get('description') as string || '').trim() || null,
          location: (fd.get('location') as string || '').trim() || null,
        }),
      });
      if (res.ok) {
        const newNode = await res.json();
        // Assign selected servers to this node
        const selectedServerIds = fd.getAll('server_ids') as string[];
        for (const srvId of selectedServerIds) {
          await fetch(`/api/servers/${srvId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: newNode.id }),
          });
        }
        const suffix = selectedServerIds.length > 0 ? ` with ${selectedServerIds.length} server${selectedServerIds.length !== 1 ? 's' : ''}` : '';
        const loc = (fd.get('location') as string || '').trim();
        const desc = (fd.get('description') as string || '').trim();
        const cliParts = [`bun run monitor add-node --name "${name}"`];
        if (loc) cliParts.push(`--location "${loc}"`);
        if (desc) cliParts.push(`--description "${desc}"`);
        for (const srvId of selectedServerIds) cliParts.push(`--assign ${srvId}`);
        setSetupMsg({ type: 'success', text: `Node "${name}" created${suffix}`, cli: cliParts.join(' ') });
        form.reset();
        serverStore.fetchServers();
      } else {
        const d = await res.json().catch(() => ({}));
        setSetupMsg({ type: 'error', text: d.error || 'Failed to create node' });
      }
    } catch {
      setSetupMsg({ type: 'error', text: 'Network error' });
    }
    setSetupLoading(false);
  }

  async function handleCreateSite(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const name = (fd.get('name') as string || '').trim();
    const url = (fd.get('url') as string || '').trim();
    const serverId = (fd.get('server_id') as string || '').trim();
    if (!name || !url || !serverId) return;
    setSetupLoading(true);
    setSetupMsg(null);
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, serverId }),
      });
      if (res.ok) {
        setSetupMsg({ type: 'success', text: `Site "${name}" added`, cli: `bun run monitor add-site --name "${name}" --url ${url} --server ${serverId}` });
        form.reset();
        serverStore.fetchServers();
      } else {
        const d = await res.json().catch(() => ({}));
        setSetupMsg({ type: 'error', text: d.error || 'Failed to add site' });
      }
    } catch {
      setSetupMsg({ type: 'error', text: 'Network error' });
    }
    setSetupLoading(false);
  }

  // ── Rendering ──

  function drawFrame(time: number) {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    const pal = palette;
    const dpr = window.devicePixelRatio || 1;
    const w = canvasSize().w;
    const h = canvasSize().h;
    const tRaw = time * 0.001;
    const tAnim = tRaw * pal.speed;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const peakList = allPeaks();
    const currentLayout = layout();

    const step = pal.gridStep;
    const gridCols = Math.ceil(w / step) + 2;
    const gridRows = Math.ceil(h / step) + 2;
    const grid = new Float32Array(gridCols * gridRows);

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        grid[gy * gridCols + gx] = terrainHeight(gx * step, gy * step, tAnim, peakList, pal);
      }
    }

    // ── Phase 1: Dashed contour terrain ──

    const [cr, cg, cb] = pal.contour;

    for (let li = 0; li < pal.levels; li++) {
      const threshold = 0.04 + (0.88 * li / (pal.levels - 1));
      const isMajor = li % 3 === 0;
      const alpha = 0.06 + threshold * 0.16;

      ctx.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
      ctx.lineWidth = isMajor ? 0.9 : 0.4;
      ctx.setLineDash(isMajor ? pal.dashMajor : pal.dashMinor);
      ctx.beginPath();

      for (let gy = 0; gy < gridRows - 1; gy++) {
        for (let gx = 0; gx < gridCols - 1; gx++) {
          const tl = grid[gy * gridCols + gx];
          const tr = grid[gy * gridCols + gx + 1];
          const br = grid[(gy + 1) * gridCols + gx + 1];
          const bl = grid[(gy + 1) * gridCols + gx];

          const mc = (tl > threshold ? 8 : 0) | (tr > threshold ? 4 : 0) | (br > threshold ? 2 : 0) | (bl > threshold ? 1 : 0);
          if (mc === 0 || mc === 15) continue;

          const px = gx * step;
          const py = gy * step;
          const topX = px + ((threshold - tl) / (tr - tl)) * step;
          const topY = py;
          const rightX = px + step;
          const rightY = py + ((threshold - tr) / (br - tr)) * step;
          const bottomX = px + ((threshold - bl) / (br - bl)) * step;
          const bottomY = py + step;
          const leftX = px;
          const leftY = py + ((threshold - tl) / (bl - tl)) * step;

          switch (mc) {
            case 1: case 14: ctx.moveTo(leftX, leftY); ctx.lineTo(bottomX, bottomY); break;
            case 2: case 13: ctx.moveTo(bottomX, bottomY); ctx.lineTo(rightX, rightY); break;
            case 3: case 12: ctx.moveTo(leftX, leftY); ctx.lineTo(rightX, rightY); break;
            case 4: case 11: ctx.moveTo(topX, topY); ctx.lineTo(rightX, rightY); break;
            case 5: ctx.moveTo(leftX, leftY); ctx.lineTo(topX, topY); ctx.moveTo(bottomX, bottomY); ctx.lineTo(rightX, rightY); break;
            case 6: case 9: ctx.moveTo(topX, topY); ctx.lineTo(bottomX, bottomY); break;
            case 7: case 8: ctx.moveTo(leftX, leftY); ctx.lineTo(topX, topY); break;
            case 10: ctx.moveTo(topX, topY); ctx.lineTo(rightX, rightY); ctx.moveTo(leftX, leftY); ctx.lineTo(bottomX, bottomY); break;
          }
        }
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── Phase 2: Node regions ──

    const [nr, ng, nb] = pal.nodeStroke;

    for (const region of currentLayout.regions) {
      const isOffline = region.status === 'offline';
      const isDegraded = region.status === 'degraded';

      let borderAlpha = 0.25;
      if (isOffline) borderAlpha = 0.3 + Math.sin(tRaw * 2.5) * 0.25;
      else if (isDegraded) borderAlpha = 0.25 + Math.sin(tRaw * 2) * 0.15;

      const borderColor = isOffline
        ? `rgba(239,68,68,${borderAlpha})`
        : isDegraded
        ? `rgba(251,191,36,${borderAlpha})`
        : `rgba(${nr},${ng},${nb},${borderAlpha})`;

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 4]);

      ctx.beginPath();
      ctx.rect(region.x, region.y, region.w, region.h);
      ctx.stroke();
      ctx.setLineDash([]);

      const tick = 10;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(region.x, region.y + tick); ctx.lineTo(region.x, region.y); ctx.lineTo(region.x + tick, region.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(region.x + region.w - tick, region.y); ctx.lineTo(region.x + region.w, region.y); ctx.lineTo(region.x + region.w, region.y + tick);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(region.x, region.y + region.h - tick); ctx.lineTo(region.x, region.y + region.h); ctx.lineTo(region.x + tick, region.y + region.h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(region.x + region.w - tick, region.y + region.h); ctx.lineTo(region.x + region.w, region.y + region.h); ctx.lineTo(region.x + region.w, region.y + region.h - tick);
      ctx.stroke();

      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.font = `600 10px ${pal.font}, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = borderColor;
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 3;
      const label = `${region.node.name.toUpperCase()}${region.node.location ? ` \u00b7 ${region.node.location}` : ''}`;
      ctx.fillText(label, region.x + 6, region.y + 6);
      ctx.restore();
    }

    // ── Phase 3: Server crosshair markers ──

    for (const peak of peakList) {
      const isOffline = peak.server.status === 'offline';
      const hasStopped = peak.containers.some(c => c.status === 'stopped' || c.status === 'exited' || c.status === 'dead');

      ctx.globalAlpha = isOffline ? (0.4 + Math.sin(tRaw * 3) * 0.3) : 0.95;

      const s = 9;
      ctx.strokeStyle = peak.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(peak.x - s, peak.y); ctx.lineTo(peak.x + s, peak.y);
      ctx.moveTo(peak.x, peak.y - s); ctx.lineTo(peak.x, peak.y + s);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(peak.x, peak.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = peak.color;
      ctx.fill();

      if (isOffline) {
        const pulseR = 16 + Math.sin(tRaw * 3) * 3;
        ctx.save();
        ctx.globalAlpha = 0.3 + Math.sin(tRaw * 3) * 0.2;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(peak.x, peak.y, pulseR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (hasStopped && !isOffline) {
        const tx = peak.x + s + 4;
        const ty = peak.y - s;
        ctx.save();
        ctx.globalAlpha = 0.6 + Math.sin(tRaw * 2.5) * 0.3;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.moveTo(tx, ty - 5);
        ctx.lineTo(tx - 4, ty + 3);
        ctx.lineTo(tx + 4, ty + 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      ctx.globalAlpha = 1;
    }

    // ── Phase 4: Site indicators ──

    for (const peak of peakList) {
      const serverSites = allSites()[peak.server.id] || [];
      if (serverSites.length === 0) continue;

      const spacing = 11;
      const startX = peak.x - (serverSites.length - 1) * spacing / 2;
      const fy = peak.y - peak.radius - 16;

      ctx.save();
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < serverSites.length; i++) {
        const site = serverSites[i];
        const sx = startX + i * spacing;
        const isDown = site.status === 'down';
        const sColor = site.status === 'up' ? '#4ade80' : isDown ? '#f87171' : '#9ca3af';

        if (isDown) {
          ctx.save();
          ctx.globalAlpha = 0.5 + Math.sin(tRaw * 3) * 0.35;
          ctx.strokeStyle = sColor;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(sx - 3.5, fy - 3.5, 7, 7);
          ctx.fillStyle = sColor;
          ctx.globalAlpha = 0.25 + Math.sin(tRaw * 3) * 0.15;
          ctx.fillRect(sx - 3.5, fy - 3.5, 7, 7);
          ctx.restore();
        } else {
          ctx.strokeStyle = sColor;
          ctx.lineWidth = 1;
          ctx.strokeRect(sx - 3, fy - 3, 6, 6);
          ctx.fillStyle = sColor;
          ctx.globalAlpha = 0.3;
          ctx.fillRect(sx - 3, fy - 3, 6, 6);
          ctx.globalAlpha = 0.85;
        }
      }
      ctx.restore();
    }

    // ── Phase 5: Labels ──

    for (const peak of peakList) {
      const serverSites = allSites()[peak.server.id] || [];
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.font = `600 11px ${pal.font}, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.7)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = peak.server.status === 'offline' ? '#f87171' : `rgba(${cr},${cg},${cb},0.9)`;
      ctx.fillText(peak.server.name.toUpperCase(), peak.x, peak.y + peak.radius + 10);

      const ctrs = peak.containers.length;
      const running = peak.containers.filter(c => c.status === 'running').length;
      const siteCount = serverSites.length;
      let subtext = `${running}/${ctrs} ctr`;
      if (siteCount > 0) subtext += ` \u00b7 ${siteCount} site${siteCount !== 1 ? 's' : ''}`;

      ctx.font = `400 10px ${pal.font}, system-ui, sans-serif`;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.5)`;
      ctx.shadowBlur = 3;
      ctx.fillText(subtext, peak.x, peak.y + peak.radius + 25);
      ctx.restore();
    }

    ctx.restore();
    animFrameId = requestAnimationFrame(drawFrame);
  }

  onMount(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    animFrameId = requestAnimationFrame(drawFrame);
  });

  onCleanup(() => {
    window.removeEventListener('resize', handleResize);
    if (animFrameId) cancelAnimationFrame(animFrameId);
  });

  // ── Tooltip content is rendered inline ──

  return (
    <div class="bp-dashboard">
      <canvas
        ref={canvasRef}
        class="bp-canvas"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoveredTarget(null); if (canvasRef) canvasRef.style.cursor = 'default'; }}
        onClick={handleClick}
      />

      {/* Top-left button group */}
      <div class="bp-top-left">
        <button
          class="bp-settings-btn"
          onClick={() => settingsStore.setSettingsOpen(true)}
          title="Settings"
        >
          <SettingsIcon />
        </button>
        <button
          class="bp-help-btn"
          onClick={() => setHelpOpen(true)}
          title="Help & Tutorial"
        >
          <HelpIcon />
        </button>
        <button
          class="bp-setup-btn"
          onClick={() => { setSetupOpen(true); setSetupMsg(null); }}
          title="Quick Setup"
        >
          <SetupIcon />
        </button>
      </div>

      <div class="bp-status-bar">
        <span><span class="count">{onlineCount()}</span>/{servers().length} online</span>
        <span><span class="count">{nodesList().length}</span> node{nodesList().length !== 1 ? 's' : ''}</span>
        <span><span class="count">{sitesUp()}</span>/{totalSites()} sites</span>
        <Show when={alertStore.activeAlerts().length > 0}>
          <span class="alert-count">{alertStore.activeAlerts().length} alert{alertStore.activeAlerts().length !== 1 ? 's' : ''}</span>
        </Show>
      </div>

      <div class="bp-legend">
        <div class="bp-legend-item">
          <div class="bp-legend-swatch" style={{ background: '#3b82f6' }} />
          <span>Low</span>
        </div>
        <div class="bp-legend-item">
          <div class="bp-legend-swatch" style={{ background: '#06b6d4' }} />
          <span>Medium</span>
        </div>
        <div class="bp-legend-item">
          <div class="bp-legend-swatch" style={{ background: '#f59e0b' }} />
          <span>High</span>
        </div>
        <div class="bp-legend-item">
          <div class="bp-legend-swatch" style={{ background: '#ef4444' }} />
          <span>Offline</span>
        </div>
        <div class="bp-legend-item">
          <div class="bp-legend-swatch" style={{ background: '#6b7280' }} />
          <span>Unknown</span>
        </div>
      </div>

      <Show when={servers().length === 0}>
        <div class="bp-empty">
          <h2>No servers connected</h2>
          <p>Deploy an agent or use Setup to get started</p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button class="bp-action-btn" onClick={() => setHelpOpen(true)}>View Tutorial</button>
            <button class="bp-action-btn" onClick={() => setSetupOpen(true)}>Quick Setup</button>
          </div>
        </div>
      </Show>

      {/* Tooltip */}
      <div
        class={`bp-tooltip ${hoveredTarget() ? 'visible' : ''}`}
        style={{ left: `${mousePos().x}px`, top: `${mousePos().y}px` }}
      >
        {(() => {
          const target = hoveredTarget();
          if (!target) return null;

          if (target.type === 'server') {
            const p = target.peak;
            const cpu = avgCpu(p.containers);
            const mem = avgMem(p.containers);
            const sites = allSites()[p.server.id] || [];
            const running = p.containers.filter(c => c.status === 'running').length;
            const sitesUpCount = sites.filter(s => s.status === 'up').length;
            return (
              <>
                <div class="bp-tooltip-name">{p.server.name}</div>
                <div class="bp-tooltip-row"><span>Status</span><span style={{ 'text-transform': 'capitalize' }}>{p.server.status}</span></div>
                <div class="bp-tooltip-row"><span>IP</span><span>{p.server.ip_address || '--'}</span></div>
                <hr class="bp-tooltip-divider" />
                <div class="bp-tooltip-row"><span>CPU</span><span>{cpu.toFixed(1)}%</span></div>
                <div class="bp-tooltip-row"><span>Memory</span><span>{mem.toFixed(1)}%</span></div>
                <div class="bp-tooltip-row"><span>Containers</span><span>{running}/{p.containers.length}</span></div>
                <Show when={sites.length > 0}>
                  <div class="bp-tooltip-row"><span>Sites</span><span>{sitesUpCount}/{sites.length} up</span></div>
                </Show>
              </>
            );
          }

          if (target.type === 'node') {
            const r = target.region;
            return (
              <>
                <div class="bp-tooltip-name">{r.node.name}</div>
                <div class="bp-tooltip-row"><span>Location</span><span>{r.node.location || '--'}</span></div>
                <div class="bp-tooltip-row"><span>Servers</span><span>{r.servers.length}</span></div>
                <div class="bp-tooltip-row"><span>Health</span><span style={{ 'text-transform': 'capitalize' }}>{r.status}</span></div>
              </>
            );
          }

          return null;
        })()}
      </div>

      {/* Detail panel */}
      <Show when={detailMode()}>
        <div class="bp-panel-overlay">
          <div class="bp-panel-backdrop" onClick={closeDetail} />
          <div class="bp-panel">
            <button class="bp-panel-close" onClick={closeDetail}>&times;</button>

            <Switch>
              {/* Node Detail */}
              <Match when={detailMode()?.type === 'node'}>
                {(() => {
                  const mode = detailMode() as { type: 'node'; node: Node };
                  const nodeServers = () => serverStore.getServersByNode(mode.node.id);
                  const status = () => serverStore.getNodeStatus(mode.node.id);
                  return (
                    <>
                      <div class="bp-panel-name">{mode.node.name}</div>
                      <div class="bp-panel-host">{mode.node.location || 'No location'}{mode.node.description ? ` \u00b7 ${mode.node.description}` : ''}</div>
                      <div class={`bp-panel-status ${status()}`}>{status()}</div>

                      <div class="bp-metrics">
                        <div>
                          <div class="bp-metric-label"><span>Avg CPU</span><span>{detailMetrics().cpu.toFixed(1)}%</span></div>
                          <div class="bp-metric-bar-bg"><div class={`bp-metric-bar-fill ${metricBarClass(detailMetrics().cpu)}`} style={{ width: `${Math.min(detailMetrics().cpu, 100)}%` }} /></div>
                        </div>
                        <div>
                          <div class="bp-metric-label"><span>Avg Memory</span><span>{detailMetrics().mem.toFixed(1)}%</span></div>
                          <div class="bp-metric-bar-bg"><div class={`bp-metric-bar-fill ${metricBarClass(detailMetrics().mem)}`} style={{ width: `${Math.min(detailMetrics().mem, 100)}%` }} /></div>
                        </div>
                      </div>

                      <div class="bp-section-heading">Servers ({nodeServers().length})</div>
                      <For each={nodeServers()}>
                        {(srv) => (
                          <div class="bp-list-item" onClick={() => openServerDetail(srv)}>
                            <div class={`bp-list-dot ${srv.status}`} />
                            <span class="bp-list-name">{srv.name}</span>
                            <span class="bp-list-stats">{srv.status}</span>
                          </div>
                        )}
                      </For>
                    </>
                  );
                })()}
              </Match>

              {/* Server Detail */}
              <Match when={detailMode()?.type === 'server'}>
                {(() => {
                  const mode = detailMode() as { type: 'server'; server: Server };
                  const parentNode = () => findNodeForServer(mode.server.id);
                  return (
                    <>
                      <Show when={parentNode()}>
                        <div class="bp-breadcrumb">
                          <span class="bp-breadcrumb-link" onClick={() => openNodeDetail(parentNode()!)}>{parentNode()!.name}</span>
                          <span class="bp-breadcrumb-sep">/</span>
                          <span>{mode.server.name}</span>
                        </div>
                      </Show>
                      <div class="bp-panel-header-row">
                        <div class="bp-panel-name">{mode.server.name}</div>
                        <button
                          class="bp-panel-action-btn"
                          onClick={() => handleRestartServer(mode.server.id)}
                          disabled={restarting()[mode.server.id]}
                          title={restarting()[mode.server.id] ? 'Restarting...' : 'Restart server'}
                        >
                          <RestartIcon />
                          <span>{restarting()[mode.server.id] ? 'Restarting...' : 'Restart'}</span>
                        </button>
                      </div>
                      <div class="bp-panel-host">{mode.server.hostname} &middot; {mode.server.ip_address || 'No IP'}</div>
                      <div class={`bp-panel-status ${mode.server.status}`}>{mode.server.status}</div>

                      <div class="bp-metrics">
                        <div>
                          <div class="bp-metric-label"><span>CPU</span><span>{detailMetrics().cpu.toFixed(1)}%</span></div>
                          <div class="bp-metric-bar-bg"><div class={`bp-metric-bar-fill ${metricBarClass(detailMetrics().cpu)}`} style={{ width: `${Math.min(detailMetrics().cpu, 100)}%` }} /></div>
                        </div>
                        <div>
                          <div class="bp-metric-label"><span>Memory</span><span>{detailMetrics().mem.toFixed(1)}%</span></div>
                          <div class="bp-metric-bar-bg"><div class={`bp-metric-bar-fill ${metricBarClass(detailMetrics().mem)}`} style={{ width: `${Math.min(detailMetrics().mem, 100)}%` }} /></div>
                        </div>
                        <div>
                          <div class="bp-metric-label"><span>Disk</span><span>{detailMetrics().disk.toFixed(1)}%</span></div>
                          <div class="bp-metric-bar-bg"><div class={`bp-metric-bar-fill ${metricBarClass(detailMetrics().disk)}`} style={{ width: `${Math.min(detailMetrics().disk, 100)}%` }} /></div>
                        </div>
                      </div>

                      <div class="bp-section-heading">Containers ({detailContainers().length})</div>
                      <For each={detailContainers()}>
                        {(c) => (
                          <div class="bp-list-item" onClick={() => openContainerDetail(c, mode.server)}>
                            <div class={`bp-list-dot ${c.status}`} />
                            <span class="bp-list-name">{c.name}</span>
                            <span class="bp-list-stats">{c.cpu_percent.toFixed(1)}% &middot; {formatBytes(c.memory_usage)}/{formatBytes(c.memory_limit)}</span>
                          </div>
                        )}
                      </For>
                      <Show when={detailContainers().length === 0}>
                        <div style={{ 'font-size': '13px', color: 'var(--text-3)', 'font-style': 'italic', 'margin-top': '8px' }}>No containers reported</div>
                      </Show>

                      <Show when={detailSites().length > 0}>
                        <div class="bp-section-heading" style={{ 'margin-top': '16px' }}>Sites ({detailSites().length})</div>
                        <For each={detailSites()}>
                          {(site) => (
                            <div class="bp-list-item" onClick={() => openSiteDetail(site, mode.server)}>
                              <div class={`bp-list-dot ${site.status}`} />
                              <div style={{ flex: '1', 'min-width': '0' }}>
                                <span class="bp-list-name" style={{ display: 'block' }}>{site.name}</span>
                                <span class="bp-list-url">{site.url}</span>
                              </div>
                              <span class="bp-list-stats">{site.response_time !== null ? `${site.response_time}ms` : '--'}</span>
                            </div>
                          )}
                        </For>
                      </Show>
                    </>
                  );
                })()}
              </Match>

              {/* Container Detail */}
              <Match when={detailMode()?.type === 'container'}>
                {(() => {
                  const mode = detailMode() as { type: 'container'; container: Container; server: Server };
                  const parentNode = () => findNodeForServer(mode.server.id);
                  const memPct = () => mode.container.memory_limit > 0 ? (mode.container.memory_usage / mode.container.memory_limit) * 100 : 0;
                  return (
                    <>
                      <div class="bp-breadcrumb">
                        <Show when={parentNode()}>
                          <span class="bp-breadcrumb-link" onClick={() => openNodeDetail(parentNode()!)}>{parentNode()!.name}</span>
                          <span class="bp-breadcrumb-sep">/</span>
                        </Show>
                        <span class="bp-breadcrumb-link" onClick={() => openServerDetail(mode.server)}>{mode.server.name}</span>
                        <span class="bp-breadcrumb-sep">/</span>
                        <span>{mode.container.name}</span>
                      </div>
                      <div class="bp-panel-header-row">
                        <div class="bp-panel-name">{mode.container.name}</div>
                        <button
                          class="bp-panel-action-btn"
                          onClick={() => handleRestartContainer(mode.server.id, mode.container.id)}
                          disabled={restarting()[mode.container.id]}
                          title={restarting()[mode.container.id] ? 'Restarting...' : 'Restart container'}
                        >
                          <RestartIcon />
                          <span>{restarting()[mode.container.id] ? 'Restarting...' : 'Restart'}</span>
                        </button>
                      </div>
                      <div class="bp-panel-host">{mode.container.image || 'No image'}</div>
                      <div class={`bp-panel-status ${mode.container.status}`}>{mode.container.status}</div>

                      <div class="bp-metrics">
                        <div>
                          <div class="bp-metric-label"><span>CPU</span><span>{mode.container.cpu_percent.toFixed(1)}%</span></div>
                          <div class="bp-metric-bar-bg"><div class={`bp-metric-bar-fill ${metricBarClass(mode.container.cpu_percent)}`} style={{ width: `${Math.min(mode.container.cpu_percent, 100)}%` }} /></div>
                        </div>
                        <div>
                          <div class="bp-metric-label"><span>Memory</span><span>{formatBytes(mode.container.memory_usage)} / {formatBytes(mode.container.memory_limit)}</span></div>
                          <div class="bp-metric-bar-bg"><div class={`bp-metric-bar-fill ${metricBarClass(memPct())}`} style={{ width: `${Math.min(memPct(), 100)}%` }} /></div>
                        </div>
                      </div>

                      <div class="bp-section-heading">Network I/O</div>
                      <div style={{ display: 'flex', gap: '24px', 'margin-bottom': '16px' }}>
                        <div style={{ 'font-size': '12px', color: 'var(--text-2)' }}>
                          <span style={{ color: 'var(--text-3)', 'text-transform': 'uppercase', 'font-size': '10px', 'letter-spacing': '0.5px' }}>RX</span>
                          <div style={{ color: 'var(--text)', 'font-weight': '600', 'margin-top': '2px' }}>{formatBytes(mode.container.network_rx)}</div>
                        </div>
                        <div style={{ 'font-size': '12px', color: 'var(--text-2)' }}>
                          <span style={{ color: 'var(--text-3)', 'text-transform': 'uppercase', 'font-size': '10px', 'letter-spacing': '0.5px' }}>TX</span>
                          <div style={{ color: 'var(--text)', 'font-weight': '600', 'margin-top': '2px' }}>{formatBytes(mode.container.network_tx)}</div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </Match>

              {/* Site Detail */}
              <Match when={detailMode()?.type === 'site'}>
                {(() => {
                  const mode = detailMode() as { type: 'site'; site: Site; server: Server };
                  const parentNode = () => findNodeForServer(mode.server.id);
                  return (
                    <>
                      <div class="bp-breadcrumb">
                        <Show when={parentNode()}>
                          <span class="bp-breadcrumb-link" onClick={() => openNodeDetail(parentNode()!)}>{parentNode()!.name}</span>
                          <span class="bp-breadcrumb-sep">/</span>
                        </Show>
                        <span class="bp-breadcrumb-link" onClick={() => openServerDetail(mode.server)}>{mode.server.name}</span>
                        <span class="bp-breadcrumb-sep">/</span>
                        <span>{mode.site.name}</span>
                      </div>
                      <div class="bp-panel-name">{mode.site.name}</div>
                      <div class="bp-panel-host">
                        <a href={mode.site.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-2)', 'text-decoration': 'none' }}>{mode.site.url}</a>
                      </div>
                      <div class={`bp-panel-status ${mode.site.status}`}>{mode.site.status}</div>

                      <div class="bp-section-heading">Details</div>
                      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'margin-bottom': '16px' }}>
                        <div style={{ display: 'flex', 'justify-content': 'space-between', 'font-size': '12px' }}>
                          <span style={{ color: 'var(--text-2)' }}>Response Time</span>
                          <span style={{ color: 'var(--text)', 'font-weight': '600' }}>{mode.site.response_time !== null ? `${mode.site.response_time}ms` : '--'}</span>
                        </div>
                        <div style={{ display: 'flex', 'justify-content': 'space-between', 'font-size': '12px' }}>
                          <span style={{ color: 'var(--text-2)' }}>Last Checked</span>
                          <span style={{ color: 'var(--text)', 'font-weight': '600' }}>{mode.site.last_checked ? new Date(mode.site.last_checked).toLocaleTimeString() : '--'}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </Match>
            </Switch>
          </div>
        </div>
      </Show>

      {/* Help Overlay */}
      <Show when={helpOpen()}>
        <div class="bp-overlay">
          <div class="bp-overlay-backdrop" onClick={() => setHelpOpen(false)} />
          <div class="bp-overlay-content">
            <button class="bp-overlay-close" onClick={() => setHelpOpen(false)}>&times;</button>
            <div class="bp-overlay-title">Getting Started</div>
            <div class="bp-overlay-subtitle">Learn how to connect servers, create environments, and track sites.</div>

            <div class="bp-help-section">
              <div class="bp-help-section-title">Adding a Server (Agent)</div>
              <div class="bp-help-step">
                <div class="bp-help-step-num">1</div>
                <div class="bp-help-step-content">
                  <h4>Install the Agent</h4>
                  <p>Copy the agent package to your target server. It requires Bun runtime.</p>
                  <code class="bp-help-code">{`# On the target server\ncurl -fsSL https://bun.sh/install | bash\ngit clone <your-repo> && cd monitor-server`}</code>
                </div>
              </div>
              <div class="bp-help-step">
                <div class="bp-help-step-num">2</div>
                <div class="bp-help-step-content">
                  <h4>Configure & Start</h4>
                  <p>Point the agent to this dashboard's URL and give it a name.</p>
                  <code class="bp-help-code">{`DASHBOARD_URL=http://<dashboard-ip>:3000 \\\nSERVER_NAME=my-server \\\nbun run --cwd packages/agent start`}</code>
                </div>
              </div>
              <div class="bp-help-step">
                <div class="bp-help-step-num">3</div>
                <div class="bp-help-step-content">
                  <h4>Verify Connection</h4>
                  <p>The server should appear on the map within seconds. Click it to see container metrics and status.</p>
                </div>
              </div>
            </div>

            <div class="bp-help-section">
              <div class="bp-help-section-title">Creating Environments (Nodes)</div>
              <div class="bp-help-step">
                <div class="bp-help-step-num">1</div>
                <div class="bp-help-step-content">
                  <h4>Create a Node</h4>
                  <p>Nodes group servers by environment (production, staging) or location. Use the + button in the top bar, the Quick Setup overlay, or the CLI:</p>
                  <code class="bp-help-code">{`bun run monitor add-node --name Production \\\n  --location US-East --description "Main cluster"`}</code>
                </div>
              </div>
              <div class="bp-help-step">
                <div class="bp-help-step-num">2</div>
                <div class="bp-help-step-content">
                  <h4>Assign Servers to Nodes</h4>
                  <p>Assign servers when creating a node, or reassign later:</p>
                  <code class="bp-help-code">{`# Assign server 1 to node 2\nbun run monitor assign --server 1 --node 2\n\n# Remove from node\nbun run monitor assign --server 1 --none`}</code>
                </div>
              </div>
            </div>

            <div class="bp-help-section">
              <div class="bp-help-section-title">Tracking Sites</div>
              <div class="bp-help-step">
                <div class="bp-help-step-num">1</div>
                <div class="bp-help-step-content">
                  <h4>Add a Site</h4>
                  <p>Monitor website uptime and response time. Use the Quick Setup overlay (+ button) or the CLI:</p>
                  <code class="bp-help-code">{`bun run monitor add-site --name "My App" \\\n  --url https://myapp.com --server 1`}</code>
                </div>
              </div>
              <div class="bp-help-step">
                <div class="bp-help-step-num">2</div>
                <div class="bp-help-step-content">
                  <h4>Monitoring</h4>
                  <p>The dashboard checks each site every 30 seconds. Green = up, red = down. Click a server to see site details and response times.</p>
                </div>
              </div>
              <div class="bp-help-step">
                <div class="bp-help-step-num">3</div>
                <div class="bp-help-step-content">
                  <h4>List Everything</h4>
                  <p>View all servers, nodes, and sites from the terminal:</p>
                  <code class="bp-help-code">{`bun run monitor ls --all`}</code>
                </div>
              </div>
            </div>

            <div class="bp-help-section">
              <div class="bp-help-section-title">Alerts & Notifications</div>
              <div class="bp-help-step">
                <div class="bp-help-step-num">1</div>
                <div class="bp-help-step-content">
                  <h4>Discord Webhooks</h4>
                  <p>Open Settings (gear icon) and paste your Discord webhook URL to receive alerts when servers go down, containers stop, or CPU/memory thresholds are exceeded.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* Setup Overlay */}
      <Show when={setupOpen()}>
        <div class="bp-overlay">
          <div class="bp-overlay-backdrop" onClick={() => setSetupOpen(false)} />
          <div class="bp-overlay-content">
            <button class="bp-overlay-close" onClick={() => setSetupOpen(false)}>&times;</button>
            <div class="bp-overlay-title">Quick Setup</div>
            <div class="bp-overlay-subtitle">Add nodes (environments) and tracked sites to your overview.</div>

            <div class="bp-setup-tabs">
              <button class={`bp-setup-tab ${setupTab() === 'node' ? 'active' : ''}`} onClick={() => { setSetupTab('node'); setSetupMsg(null); }}>New Node</button>
              <button class={`bp-setup-tab ${setupTab() === 'site' ? 'active' : ''}`} onClick={() => { setSetupTab('site'); setSetupMsg(null); }}>New Site</button>
            </div>

            <Show when={setupMsg()}>
              <div class={setupMsg()!.type === 'success' ? 'bp-setup-success' : 'bp-setup-error'} style={{ 'margin-bottom': '16px' }}>
                <div>{setupMsg()!.text}</div>
                <Show when={setupMsg()!.cli}>
                  <code class="bp-help-code" style={{ 'margin-top': '8px', 'font-size': '11px' }}>{setupMsg()!.cli}</code>
                </Show>
              </div>
            </Show>

            <Show when={setupTab() === 'node'}>
              <form class="bp-setup-form" onSubmit={handleCreateNode}>
                <div class="bp-setup-field">
                  <label>Node Name *</label>
                  <input type="text" name="name" placeholder="e.g. Production, Staging, US-East" required />
                </div>
                <div class="bp-setup-field">
                  <label>Location</label>
                  <input type="text" name="location" placeholder="e.g. US-East, EU-West, Tokyo" />
                </div>
                <div class="bp-setup-field">
                  <label>Description</label>
                  <input type="text" name="description" placeholder="e.g. Main production cluster" />
                </div>
                <button type="submit" class="bp-setup-submit" disabled={setupLoading()}>
                  {setupLoading() ? 'Creating...' : 'Create Node'}
                </button>
              </form>
            </Show>

            <Show when={setupTab() === 'site'}>
              <form class="bp-setup-form" onSubmit={handleCreateSite}>
                <div class="bp-setup-field">
                  <label>Site Name *</label>
                  <input type="text" name="name" placeholder="e.g. My App, API, Blog" required />
                </div>
                <div class="bp-setup-field">
                  <label>URL *</label>
                  <input type="url" name="url" placeholder="https://example.com" required />
                </div>
                <div class="bp-setup-field">
                  <label>Server *</label>
                  <select name="server_id" required>
                    <option value="">Select a server...</option>
                    <For each={servers()}>
                      {(srv) => <option value={srv.id}>{srv.name} ({srv.status})</option>}
                    </For>
                  </select>
                </div>
                <button type="submit" class="bp-setup-submit" disabled={setupLoading() || servers().length === 0}>
                  {setupLoading() ? 'Adding...' : 'Add Site'}
                </button>
                <Show when={servers().length === 0}>
                  <div style={{ 'font-size': '12px', color: 'var(--text-3)', 'font-style': 'italic' }}>
                    No servers available. Deploy an agent first.
                  </div>
                </Show>
              </form>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
