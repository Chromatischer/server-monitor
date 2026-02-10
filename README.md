# Monitor Server

Self-hosted server and infrastructure monitoring dashboard. Track servers, Docker containers, uptime, and resource usage from a single interface.

Built with Bun, Elysia, SolidJS, and SQLite.

## Features

- Real-time server metrics (CPU, memory, disk)
- Docker container monitoring and remote restart
- Site uptime and response time tracking
- Environment grouping with nodes
- Discord webhook alerts
- CLI tools for management
- SSE-powered live dashboard

## Setup

### Requirements

- [Bun](https://bun.sh) runtime

### Install

```sh
git clone <repo-url> && cd monitor-server
bun install
```

### Start the Dashboard

```sh
bun run dev
```

This starts the backend API on port 3000 and the frontend dev server. The dashboard is ready to receive agents.

For production, build the frontend and run the dashboard directly:

```sh
bun run build
bun run dev:dashboard
```

### Environment Variables (Dashboard)

| Variable  | Default      | Description              |
|-----------|--------------|--------------------------|
| `PORT`    | `3000`       | HTTP port                |
| `DB_PATH` | `monitor.db` | SQLite database file path |

The database is created automatically on first run.

## Adding Servers

Each server you want to monitor runs an **agent** that reports metrics back to the dashboard.

### 1. Install the Agent

On the target server, install Bun and clone the repo:

```sh
curl -fsSL https://bun.sh/install | bash
git clone <repo-url> && cd monitor-server
bun install
```

### 2. Start the Agent

Point the agent at your dashboard and give it a name:

```sh
DASHBOARD_URL=http://<dashboard-ip>:3000 \
SERVER_NAME=my-server \
bun run dev:agent
```

The agent registers with the dashboard, then sends system and Docker container metrics on a regular interval (default: every 10 seconds).

### Agent Environment Variables

| Variable        | Default                | Description                     |
|-----------------|------------------------|---------------------------------|
| `DASHBOARD_URL` | `http://localhost:3000` | URL of the dashboard server    |
| `SERVER_NAME`   | System hostname         | Display name for this server   |

### What the Agent Collects

- CPU, memory, and disk usage (via `/proc` and `df`)
- Docker container list, status, CPU, memory, and network I/O (via `/var/run/docker.sock`)
- Responds to remote commands (restart server, restart container)

The agent requires Linux and access to `/var/run/docker.sock` for container metrics.

## Creating Nodes

Nodes group servers by environment or location (e.g. Production, Staging, US-East). You can create them from the dashboard UI or the CLI.

### From the Dashboard

Click the **+** button in the top bar to open Quick Setup, then fill in the node name, location, and description.

### From the CLI

```sh
bun run monitor -- add-node --name Production --location US-East
bun run monitor -- add-node --name Staging --description "Pre-release environment"
```

Assign servers to a node at creation time or later:

```sh
# Assign during creation
bun run monitor -- add-node --name Production --assign <server-id>

# Assign an existing server to a node
bun run monitor -- assign --server <server-id> --node <node-id>

# Remove a server from its node
bun run monitor -- assign --server <server-id> --none
```

## Tracking Sites

Monitor website uptime and response time. The dashboard checks each site every 30 seconds.

### From the Dashboard

Open Quick Setup (**+** button) and switch to the **New Site** tab. Enter the site name, URL, and which server to attach it to.

### From the CLI

```sh
bun run monitor -- add-site --name "My App" --url https://myapp.com --server <server-id>
```

## CLI Reference

All management commands go through the `monitor` CLI:

```sh
bun run monitor -- <command> [options]
```

| Command    | Description                                      |
|------------|--------------------------------------------------|
| `add-node` | Create a node and optionally assign servers      |
| `add-site` | Add a site to monitor                            |
| `assign`   | Assign or unassign a server to/from a node       |
| `ls`       | List servers, nodes, and sites                   |

### Examples

```sh
# List all servers
bun run monitor -- ls

# List servers, nodes, and sites
bun run monitor -- ls --all

# List only nodes
bun run monitor -- ls --nodes

# Create a node with servers assigned
bun run monitor -- add-node --name Production --location US-East --assign srv-1 --assign srv-2

# Add a site
bun run monitor -- add-site --name "API" --url https://api.example.com --server srv-1

# Move a server to a different node
bun run monitor -- assign --server srv-1 --node node-prod
```

Run `bun run monitor -- <command> --help` for full options on any command.

All CLI commands default to `http://localhost:3000`. Set `DASHBOARD_URL` or pass `--dashboard <url>` to target a remote dashboard.

## Alerts

The dashboard generates alerts for:

- Server going offline
- Container stopping
- CPU usage exceeding threshold (default: 90%)
- Memory usage exceeding threshold (default: 90%)

Configure Discord webhook notifications in the dashboard Settings (gear icon). Alerts are sent in real time when thresholds are crossed.

## Project Structure

```
packages/
  dashboard/   Elysia API server + SQLite database
  web/         SolidJS frontend (Vite)
  agent/       Monitoring agent (runs on target servers)
  shared/      Shared types and constants
scripts/       CLI management tools
```

## Development

```sh
bun install          # Install dependencies
bun run dev          # Start dashboard + frontend dev server
bun run build        # Build frontend to packages/dashboard/public
bun run dev:agent    # Start an agent instance
```
