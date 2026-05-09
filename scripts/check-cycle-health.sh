#!/usr/bin/env bash
# Quorum — Cycle Health CI Gate
#
# Queries each deployed canister's cycle balance and exits non-zero if any
# canister is below the CRITICAL threshold.
#
# Usage: bash scripts/check-cycle-health.sh
# Environment:
#   CRITICAL_CYCLES  — fail threshold (default: 500_000_000 = 500M)
#   WARNING_CYCLES   — warn threshold (default: 1_000_000_000_000 = 1T)

set -uo pipefail

CRITICAL_CYCLES="${CRITICAL_CYCLES:-500000000}"
WARNING_CYCLES="${WARNING_CYCLES:-1000000000000}"

CANISTERS=(members governance treasury documents announcements)

if ! dfx ping 2>/dev/null; then
  echo "❌  dfx is not running — cannot check cycle health"
  exit 1
fi

echo "============================================"
echo "  Quorum — Cycle Health Check"
echo "  Critical : $CRITICAL_CYCLES cycles"
echo "  Warning  : $WARNING_CYCLES cycles"
echo "============================================"

CRITICAL_LIST=()
WARNING_LIST=()

for CANISTER in "${CANISTERS[@]}"; do
  CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")
  if [ -z "$CANISTER_ID" ]; then
    echo "  ⬜  $CANISTER — not deployed, skipping"
    continue
  fi

  STATUS_OUT=$(dfx canister status "$CANISTER" 2>&1 || echo "")
  CYCLES_RAW=$(echo "$STATUS_OUT" | grep -i "^Cycles:" | head -1 | awk '{print $2}' | tr -d '_,')

  if [ -z "$CYCLES_RAW" ] || ! [[ "$CYCLES_RAW" =~ ^[0-9]+$ ]]; then
    echo "  ❓  $CANISTER — could not read balance"
    continue
  fi

  if [ "$CYCLES_RAW" -lt "$CRITICAL_CYCLES" ]; then
    echo "  🔴  $CANISTER — CRITICAL: $CYCLES_RAW cycles"
    CRITICAL_LIST+=("$CANISTER")
  elif [ "$CYCLES_RAW" -lt "$WARNING_CYCLES" ]; then
    echo "  🟡  $CANISTER — WARNING:  $CYCLES_RAW cycles"
    WARNING_LIST+=("$CANISTER")
  else
    echo "  🟢  $CANISTER — OK:       $CYCLES_RAW cycles"
  fi
done

echo ""
echo "  Critical : ${#CRITICAL_LIST[@]}"
echo "  Warning  : ${#WARNING_LIST[@]}"

if [ ${#CRITICAL_LIST[@]} -gt 0 ]; then
  echo ""
  echo "❌  CRITICAL — top up immediately: ${CRITICAL_LIST[*]}"
  exit 1
fi

echo ""
echo "✅  Cycle health check passed"
exit 0
