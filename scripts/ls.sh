#!/usr/bin/env bash
set -euo pipefail

DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000}"

usage() {
  echo "Usage: monitor ls [--nodes] [--sites]"
  echo ""
  echo "List servers, nodes, and sites."
  echo ""
  echo "Options:"
  echo "  --nodes      Also list nodes"
  echo "  --sites      Also list sites"
  echo "  --all        List everything"
  echo "  --dashboard  Dashboard URL    default: $DASHBOARD_URL"
  echo "  --help       Show this help"
  exit 0
}

show_nodes=false
show_sites=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --nodes)     show_nodes=true; shift ;;
    --sites)     show_sites=true; shift ;;
    --all)       show_nodes=true; show_sites=true; shift ;;
    --dashboard) DASHBOARD_URL="$2"; shift 2 ;;
    --help|-h)   usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

response=$(curl -s "$DASHBOARD_URL/api/servers")

# Parse servers
echo "SERVERS"
echo "-------"
echo "$response" | grep -o '"id":"[^"]*"' | while read -r match; do
  echo "$response"
  break
done > /dev/null

# Use a simpler approach - bun to parse JSON
bun -e "
const data = $response;
if (data.servers && data.servers.length > 0) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('ID', 38) + pad('NAME', 20) + pad('STATUS', 10) + pad('NODE', 20) + 'HOSTNAME');
  console.log('-'.repeat(100));
  for (const s of data.servers) {
    const node = data.nodes?.find(n => n.id === s.node_id);
    console.log(pad(s.id, 38) + pad(s.name, 20) + pad(s.status, 10) + pad(node?.name || '-', 20) + (s.hostname || '-'));
  }
} else {
  console.log('  No servers registered');
}

if ($show_nodes && data.nodes && data.nodes.length > 0) {
  console.log('');
  console.log('NODES');
  console.log('-----');
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('ID', 20) + pad('NAME', 20) + pad('LOCATION', 20) + 'DESCRIPTION');
  console.log('-'.repeat(80));
  for (const n of data.nodes) {
    console.log(pad(n.id, 20) + pad(n.name, 20) + pad(n.location || '-', 20) + (n.description || '-'));
  }
}
"

if $show_sites; then
  sites_response=$(curl -s "$DASHBOARD_URL/api/sites")
  bun -e "
const data = $sites_response;
if (data.sites && data.sites.length > 0) {
  console.log('');
  console.log('SITES');
  console.log('-----');
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('ID', 38) + pad('NAME', 20) + pad('STATUS', 8) + pad('RESPONSE', 12) + 'URL');
  console.log('-'.repeat(100));
  for (const s of data.sites) {
    const rt = s.response_time !== null ? s.response_time + 'ms' : '-';
    console.log(pad(s.id, 38) + pad(s.name, 20) + pad(s.status, 8) + pad(rt, 12) + s.url);
  }
} else {
  console.log('');
  console.log('SITES');
  console.log('-----');
  console.log('  No sites tracked');
}
"
fi
