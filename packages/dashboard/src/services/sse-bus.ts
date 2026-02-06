type SSEWriter = {
  write(data: string): void;
  close(): void;
  closed: boolean;
};

const clients = new Set<SSEWriter>();

export function addClient(writer: SSEWriter): void {
  clients.add(writer);
}

export function removeClient(writer: SSEWriter): void {
  clients.delete(writer);
}

export function broadcast(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    if (client.closed) {
      clients.delete(client);
      continue;
    }
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
