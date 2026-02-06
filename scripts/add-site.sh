#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"

usage() {
  echo "Usage: monitor add-site --name <name> --url <url> --server <server-id>"
  echo ""
  echo "Add a site to monitor for uptime and response time."
  echo ""
  echo "Options:"
  echo "  --name       Site display name (required)     e.g. My App, API"
  echo "  --url        URL to monitor (required)         e.g. https://myapp.com"
  echo "  --server     Server ID to attach to (required)"
  echo "  --dashboard  Dashboard URL                     default: $DASHBOARD_URL"
  echo "  --help       Show this help"
  echo ""
  echo "Examples:"
  echo "  monitor add-site --name \"My App\" --url https://myapp.com --server abc123"
  echo ""
  echo "Use 'monitor ls' to find server IDs."
  exit 0
}

name=""
url=""
server_id=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)      name="$2"; shift 2 ;;
    --url)       url="$2"; shift 2 ;;
    --server)    server_id="$2"; shift 2 ;;
    --dashboard) DASHBOARD_URL="$2"; shift 2 ;;
    --help|-h)   usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$name" || -z "$url" || -z "$server_id" ]]; then
  echo "Error: --name, --url, and --server are all required"
  echo ""
  usage
fi

response=$(curl -s -w "\n%{http_code}" -X POST "$DASHBOARD_URL/api/sites" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$name\",\"url\":\"$url\",\"serverId\":\"$server_id\"}")

http_code=$(echo "$response" | tail -1)
body_out=$(echo "$response" | sed '$d')

if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
  site_id=$(echo "$body_out" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "Site added: $name -> $url (id: $site_id)"
else
  echo "Error adding site (HTTP $http_code): $body_out"
  exit 1
fi
