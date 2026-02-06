import { createSignal, createRoot, createMemo } from 'solid-js';
import type { Server, Container, Site, Node, Command } from '@monitor/shared';

function createServerStore() {
  const [servers, setServers] = createSignal<Server[]>([]);
  const [containers, setContainers] = createSignal<Record<string, Container[]>>({});
  const [sites, setSites] = createSignal<Record<string, Site[]>>({});
  const [nodes, setNodes] = createSignal<Node[]>([]);
  const [commands, setCommands] = createSignal<Command[]>([]);
  const [selectedServerId, setSelectedServerId] = createSignal<string | null>(null);

  const allSites = createMemo(() => {
    const map = sites();
    const result: Site[] = [];
    for (const arr of Object.values(map)) {
      result.push(...arr);
    }
    return result;
  });

  function getNodeStatus(nodeId: string): 'online' | 'degraded' | 'offline' {
    const nodeServers = servers().filter(s => s.node_id === nodeId);
    if (nodeServers.length === 0) return 'offline';
    if (nodeServers.every(s => s.status === 'offline')) return 'offline';
    if (nodeServers.some(s => s.status === 'offline' || s.status === 'degraded')) return 'degraded';
    return 'online';
  }

  function getServersByNode(nodeId: string): Server[] {
    return servers().filter(s => s.node_id === nodeId);
  }

  function getOrphanServers(): Server[] {
    return servers().filter(s => !s.node_id);
  }

  async function fetchServers() {
    try {
      const [serverRes, siteRes, nodeRes] = await Promise.all([
        fetch('/api/servers'),
        fetch('/api/sites'),
        fetch('/api/nodes'),
      ]);
      const serverData = await serverRes.json();
      const siteData = await siteRes.json();
      const nodeData = await nodeRes.json();
      setServers(serverData.servers || []);
      setNodes(nodeData.nodes || []);

      // Group sites by server_id
      const siteList: Site[] = siteData.sites || [];
      const grouped: Record<string, Site[]> = {};
      for (const site of siteList) {
        if (!grouped[site.server_id]) grouped[site.server_id] = [];
        grouped[site.server_id].push(site);
      }
      setSites(grouped);
    } catch (err) {
      console.error('Failed to fetch servers:', err);
    }
  }

  async function fetchServerDetail(id: string) {
    try {
      const res = await fetch(`/api/servers/${id}`);
      const data = await res.json();
      if (data.containers) {
        setContainers(prev => ({ ...prev, [id]: data.containers }));
      }
      if (data.sites) {
        setSites(prev => ({ ...prev, [id]: data.sites }));
      }
      return data;
    } catch (err) {
      console.error('Failed to fetch server detail:', err);
      return null;
    }
  }

  async function fetchNodeDetail(id: string) {
    try {
      const res = await fetch(`/api/nodes/${id}`);
      return await res.json();
    } catch (err) {
      console.error('Failed to fetch node detail:', err);
      return null;
    }
  }

  async function restartServer(serverId: string) {
    try {
      const res = await fetch(`/api/servers/${serverId}/restart`, { method: 'POST' });
      const cmd = await res.json();
      if (cmd.id) {
        setCommands(prev => [...prev, cmd]);
      }
      return cmd;
    } catch (err) {
      console.error('Failed to restart server:', err);
      return null;
    }
  }

  async function restartContainer(serverId: string, containerId: string) {
    try {
      const res = await fetch(`/api/servers/${serverId}/containers/${encodeURIComponent(containerId)}/restart`, { method: 'POST' });
      const cmd = await res.json();
      if (cmd.id) {
        setCommands(prev => [...prev, cmd]);
      }
      return cmd;
    } catch (err) {
      console.error('Failed to restart container:', err);
      return null;
    }
  }

  async function deleteServer(id: string) {
    await fetch(`/api/servers/${id}`, { method: 'DELETE' });
    setServers(prev => prev.filter(s => s.id !== id));
  }

  function handleSSE(event: string, data: any) {
    if (event === 'server:update') {
      if (data.deleted) {
        setServers(prev => prev.filter(s => s.id !== data.id));
        return;
      }
      setServers(prev => {
        const idx = prev.findIndex(s => s.id === data.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...data };
          return updated;
        }
        return [...prev, data];
      });
    }
    if (event === 'container:update' && data.serverId) {
      setContainers(prev => ({ ...prev, [data.serverId]: data.containers || [] }));
    }
    if (event === 'site:update' && data.server_id) {
      setSites(prev => {
        const serverId = data.server_id;
        const existing = prev[serverId] || [];
        const idx = existing.findIndex(s => s.id === data.id);
        if (idx >= 0) {
          const updated = [...existing];
          updated[idx] = { ...updated[idx], ...data };
          return { ...prev, [serverId]: updated };
        }
        return { ...prev, [serverId]: [...existing, data] };
      });
    }
    if (event === 'node:update') {
      if (data.deleted) {
        setNodes(prev => prev.filter(n => n.id !== data.id));
        return;
      }
      setNodes(prev => {
        const idx = prev.findIndex(n => n.id === data.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...data };
          return updated;
        }
        return [...prev, data];
      });
    }
    if (event === 'command:update') {
      setCommands(prev => {
        const idx = prev.findIndex(c => c.id === data.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...data };
          return updated;
        }
        return [...prev, data];
      });
    }
  }

  return {
    servers,
    containers,
    sites,
    nodes,
    commands,
    allSites,
    selectedServerId,
    setSelectedServerId,
    fetchServers,
    fetchServerDetail,
    fetchNodeDetail,
    restartServer,
    restartContainer,
    deleteServer,
    handleSSE,
    getNodeStatus,
    getServersByNode,
    getOrphanServers,
  };
}

export const serverStore = createRoot(createServerStore);
