#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# test-integration.sh — run frontend integration tests against the local replica
#
# Usage:
#   npm run test:integration              # run all integration tests
#   npm run test:integration -- members  # filter to a specific test file
#
# Prerequisites:
#   make deploy   (starts the replica, deploys all canisters, writes canister IDs)
#
# What it does:
#   1. Checks the local replica is reachable
#   2. Reads canister IDs from .dfx/local/canister_ids.json (written by deploy.sh)
#   3. Exports them as CANISTER_ID_* env vars
#   4. Runs vitest with the integration config
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"

# ── 1. Replica health check ───────────────────────────────────────────────────

echo "▶ Checking local replica…"
if ! curl -sf http://localhost:4943/api/v2/status >/dev/null 2>&1; then
  echo ""
  echo "  ✗ Local replica is not running."
  echo "    Deploy first with: make deploy"
  echo ""
  exit 1
fi
echo "  ✓ Replica is up"

# ── 2. Read canister IDs from deploy-time JSON ────────────────────────────────

CANISTER_IDS_FILE="$ROOT_DIR/.dfx/local/canister_ids.json"

if [ ! -f "$CANISTER_IDS_FILE" ]; then
  echo ""
  echo "  ✗ No canister IDs found at $CANISTER_IDS_FILE"
  echo "    Deploy first with: make deploy"
  echo ""
  exit 1
fi

echo "▶ Reading canister IDs from $CANISTER_IDS_FILE…"

while IFS='=' read -r key value; do
  export "$key=$value"
done < <(
  node -e "
    const ids = require('$CANISTER_IDS_FILE');
    for (const [name, nets] of Object.entries(ids)) {
      const id = nets.local || '';
      if (id) {
        const upper = name.toUpperCase().replace(/-/g,'_');
        console.log('CANISTER_ID_' + upper + '=' + id);
      }
    }
  " 2>/dev/null || true
)

echo "  Deployed canisters:"
env | grep "CANISTER_ID_" | sort | while IFS='=' read -r k v; do
  echo "    $k = $v"
done

# ── 3. Run vitest with integration config ─────────────────────────────────────

echo ""
echo "▶ Running integration tests…"
echo ""

cd "$FRONTEND_DIR"

npx vitest run \
  --config vitest.integration.ts \
  --reporter=verbose \
  "$@"

echo ""
echo "✓ Integration tests complete"
