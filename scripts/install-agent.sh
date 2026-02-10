#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: install-agent.sh --dashboard <url> [--user <user>]"
  echo ""
  echo "Install the monitor agent as a systemd service."
  echo ""
  echo "Options:"
  echo "  --dashboard  Dashboard URL (required)          e.g. http://192.168.1.50:3000"
  echo "  --name       Override server name               default: hostname"
  echo "  --user       User to run the service as         default: current user"
  echo "  --help       Show this help"
  echo ""
  echo "Examples:"
  echo "  sudo ./scripts/install-agent.sh --dashboard http://192.168.1.50:3000"
  echo "  sudo ./scripts/install-agent.sh --dashboard http://monitor.local --name web-01"
  exit 0
}

dashboard_url=""
server_name=""
run_user="$(logname 2>/dev/null || echo "$USER")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dashboard) dashboard_url="$2"; shift 2 ;;
    --name)      server_name="$2"; shift 2 ;;
    --user)      run_user="$2"; shift 2 ;;
    --help|-h)   usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$dashboard_url" ]]; then
  echo "Error: --dashboard is required"
  echo ""
  usage
fi

if [[ $EUID -ne 0 ]]; then
  echo "Error: this script must be run as root (use sudo)"
  exit 1
fi

bun_path=$(su - "$run_user" -c 'which bun' 2>/dev/null || true)
if [[ -z "$bun_path" ]]; then
  echo "Error: bun not found for user $run_user"
  echo "Install it: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

workdir="$(cd "$(dirname "$0")/.." && pwd)"

docker_group=""
if getent group docker >/dev/null 2>&1; then
  docker_group="SupplementaryGroups=docker"
elif [[ -S /var/run/docker.sock ]]; then
  groupadd docker
  usermod -aG docker "$run_user"
  docker_group="SupplementaryGroups=docker"
  echo "Created docker group and added $run_user"
fi

name_line=""
if [[ -n "$server_name" ]]; then
  name_line="Environment=SERVER_NAME=$server_name"
fi

run_group=$(id -gn "$run_user")

cat > /etc/systemd/system/monitor-agent.service <<EOF
[Unit]
Description=Monitor Agent
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=$workdir
Environment=DASHBOARD_URL=$dashboard_url
$name_line
ExecStart=$bun_path run packages/agent/src/index.ts
Restart=always
RestartSec=5
User=$run_user
Group=$run_group
$docker_group

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now monitor-agent

echo "Agent service installed and started"
echo "  Dashboard: $dashboard_url"
echo "  Server:    ${server_name:-$(hostname)}"
echo "  User:      $run_user"
echo "  Docker:    ${docker_group:+yes}${docker_group:-no (not installed)}"
echo ""
echo "Commands:"
echo "  sudo systemctl status monitor-agent"
echo "  sudo journalctl -u monitor-agent -f"
echo "  sudo systemctl restart monitor-agent"
