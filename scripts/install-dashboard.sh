#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: install-dashboard.sh [--port <port>] [--db <path>] [--user <user>]"
  echo ""
  echo "Install the monitor dashboard as a systemd service."
  echo ""
  echo "Options:"
  echo "  --port    Port to listen on                  default: 3000"
  echo "  --db      SQLite database path               default: /opt/monitor-server/monitor.db"
  echo "  --user    User to run the service as          default: current user"
  echo "  --help    Show this help"
  echo ""
  echo "Examples:"
  echo "  sudo ./scripts/install-dashboard.sh"
  echo "  sudo ./scripts/install-dashboard.sh --port 80 --user sysadmin"
  exit 0
}

port="3000"
db_path="/opt/monitor-server/monitor.db"
run_user="$(logname 2>/dev/null || echo "$USER")"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)  port="$2"; shift 2 ;;
    --db)    db_path="$2"; shift 2 ;;
    --user)  run_user="$2"; shift 2 ;;
    --help|-h) usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

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

cap_line=""
if [[ "$port" -lt 1024 ]]; then
  cap_line="AmbientCapabilities=CAP_NET_BIND_SERVICE"
fi

run_group=$(id -gn "$run_user")

cat > /etc/systemd/system/monitor-dashboard.service <<EOF
[Unit]
Description=Monitor Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=$workdir
Environment=PORT=$port
Environment=DB_PATH=$db_path
ExecStart=$bun_path run packages/dashboard/src/index.ts
Restart=always
RestartSec=5
User=$run_user
Group=$run_group
$cap_line

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now monitor-dashboard

echo "Dashboard service installed and started"
echo "  Port: $port"
echo "  DB:   $db_path"
echo "  User: $run_user"
echo "  URL:  http://$(hostname -I | awk '{print $1}'):$port"
echo ""
echo "Commands:"
echo "  sudo systemctl status monitor-dashboard"
echo "  sudo journalctl -u monitor-dashboard -f"
echo "  sudo systemctl restart monitor-dashboard"
