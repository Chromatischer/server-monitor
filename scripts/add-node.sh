#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"

usage() {
  echo "Usage: monitor add-node --name <name> [--location <loc>] [--description <desc>] [--assign <server-id>...]"
  echo ""
  echo "Create a node (environment grouping) and optionally assign servers to it."
  echo ""
  echo "Options:"
  echo "  --name         Node name (required)          e.g. Production, Staging"
  echo "  --location     Data center / region           e.g. US-East, EU-West"
  echo "  --description  Short description              e.g. Main production cluster"
  echo "  --assign       Server ID to assign (repeatable)"
  echo "  --dashboard    Dashboard URL                  default: $DASHBOARD_URL"
  echo "  --help         Show this help"
  echo ""
  echo "Examples:"
  echo "  monitor add-node --name Production --location US-East"
  echo "  monitor add-node --name Staging --assign abc123 --assign def456"
  exit 0
}

name=""
location=""
description=""
assign_ids=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)       name="$2"; shift 2 ;;
    --location)   location="$2"; shift 2 ;;
    --description) description="$2"; shift 2 ;;
    --assign)     assign_ids+=("$2"); shift 2 ;;
    --dashboard)  DASHBOARD_URL="$2"; shift 2 ;;
    --help|-h)    usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

if [[ -z "$name" ]]; then
  echo "Error: --name is required"
  echo ""
  usage
fi

body="{\"name\":\"$name\""
[[ -n "$location" ]] && body+=",\"location\":\"$location\""
[[ -n "$description" ]] && body+=",\"description\":\"$description\""
body+="}"

response=$(curl -s -w "\n%{http_code}" -X POST "$DASHBOARD_URL/api/nodes" \
  -H "Content-Type: application/json" \
  -d "$body")

http_code=$(echo "$response" | tail -1)
body_out=$(echo "$response" | sed '$d')

if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
  node_id=$(echo "$body_out" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  echo "Node created: $name (id: $node_id)"

  for sid in "${assign_ids[@]}"; do
    assign_resp=$(curl -s -w "\n%{http_code}" -X PUT "$DASHBOARD_URL/api/servers/$sid" \
      -H "Content-Type: application/json" \
      -d "{\"node_id\":\"$node_id\"}")
    assign_code=$(echo "$assign_resp" | tail -1)
    if [[ "$assign_code" -ge 200 && "$assign_code" -lt 300 ]]; then
      echo "  Assigned server $sid to node"
    else
      echo "  Failed to assign server $sid (HTTP $assign_code)"
    fi
  done
else
  echo "Error creating node (HTTP $http_code): $body_out"
  exit 1
fi
