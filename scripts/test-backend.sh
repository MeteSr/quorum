#!/usr/bin/env bash
# Run all backend canister integration tests.
# Requires a running dfx replica with canisters deployed.
set -euo pipefail

PASS=0
FAIL=0
SKIP=0

echo "============================================"
echo "  Quorum — Backend Integration Tests"
echo "============================================"

if ! dfx ping >/dev/null 2>&1; then
  echo "❌  Local dfx replica is not running. Run: dfx start --background"
  exit 1
fi

CANISTERS=(members governance treasury documents announcements violations)

for CANISTER in "${CANISTERS[@]}"; do
  CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")
  if [ -z "$CANISTER_ID" ]; then
    echo ""
    echo "--- $CANISTER: SKIP (not deployed) ---"
    SKIP=$((SKIP+1))
    continue
  fi

  SCRIPT="backend/$CANISTER/test.sh"
  if [ ! -f "$SCRIPT" ]; then
    echo ""
    echo "--- $CANISTER: SKIP (no test.sh) ---"
    SKIP=$((SKIP+1))
    continue
  fi

  echo ""
  echo "--- $CANISTER ---"
  if bash "$SCRIPT"; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
  fi
done

echo ""
echo "============================================"
echo "  Canisters: $PASS passed, $FAIL failed, $SKIP skipped"
echo "============================================"
[ "$FAIL" -eq 0 ]
