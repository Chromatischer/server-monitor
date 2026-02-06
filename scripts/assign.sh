#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"

usage() {
  echo "Usage: monitor assign --server <server-id> --node <node-id>"
  echo "       monitor assign --server <server-id> --none"
  echo ""
  echo "Assign a server to a node, or remove it from its current node."
  echo ""
  echo "Options:"
  echo "  --server     Server ID (required)"
  echo "  --node       Node ID to assign to"
  echo "  --none       Remove server from its current node"
  echo "  --dashboard  Dashboard URL    default: $DASHBOARD_URL"
  echo "  --help       Show this help"
  echo ""
  echo "Examples:"
  echo "  monitor assign --server abc123 --node node-a1b2c3d4"
  echo "  monitor assign --server abc123 --none"
  echo ""
  echo "Use 'monitor ls --nodes' to find server and node IDs."
  exit 0
}

server_id=""
node_id=""
remove=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)    server_id="$2"; shift 2 ;;
    --node)      node_id="$2"; shift 2 ;;
    --none)      remove=true; shift ;;
    --dashboard) DASHBOARD_URL="$2"; shift 2 ;;
    --help|-h)   usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$server_id" ]]; then
  echo "Error: --server is required"
  echo ""
  usage
fi

if [[ -z "$node_id" && "$remove" == false ]]; then
  echo "Error: --node or --none is required"
  echo ""
  usage
fi

if $remove; then
  body='{"node_id":null}'
else
  body="{\"node_id\":\"$node_id\"}"
fi

response=$(curl -s -w "\n%{http_code}" -X PUT "$DASHBOARD_URL/api/servers/$server_id" \
  -H "Content-Type: application/json" \
  -d "$body")

http_code=$(echo "$response" | tail -1)
body_out=$(echo "$response" | sed '$d')

if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
  if $remove; then
    echo "Server $server_id removed from node"
  else
    echo "Server $server_id assigned to node $node_id"
  fi
else
  echo "Error (HTTP $http_code): $body_out"
  exit 1
fi
