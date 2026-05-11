#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# test-integration.sh — run frontend integration tests against the local replica
#
# Usage:
#   npm run test:integration              # run all integration tests
#   npm run test:integration -- members  # filter to a specific test file
#
# Prerequisites:
#   icp network start -d   (replica must be running)
#   make deploy            (all canisters must be deployed)
#
# What it does:
#   1. Checks the local replica is reachable
#   2. Reads canister IDs via icp canister id <name> -e local
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
  echo "    Start it with:  icp network start -d"
  echo "    Then deploy:    make deploy"
  echo ""
  exit 1
fi
echo "  ✓ Replica is up"

# ── 2. Read canister IDs from icp CLI ─────────────────────────────────────────

CANISTERS=(
  members governance treasury documents announcements
  maintenance violations meetings calendar arc parking vendors discussions
)

echo "▶ Reading canister IDs…"
cd "$ROOT_DIR"
for canister in "${CANISTERS[@]}"; do
  _id=$(icp canister id "$canister" -e local 2>/dev/null || echo "")
  if [ -n "$_id" ]; then
    _upper=$(echo "$canister" | tr '[:lower:]' '[:upper:]')
    export "CANISTER_ID_${_upper}=$_id"
    echo "  CANISTER_ID_${_upper} = $_id"
  else
    echo "  ⚠  $canister not deployed — tests for this canister will be skipped"
  fi
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
