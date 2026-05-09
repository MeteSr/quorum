#!/usr/bin/env bash
# Quorum — Cycle Top-Up Watchdog
#
# Tops up any canister whose balance is below TOP_UP_TRIGGER_T trillion cycles.
#
# Usage:
#   bash scripts/top-up-canisters.sh
#   bash scripts/top-up-canisters.sh --dry-run

set -uo pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

DFX_NETWORK="${DFX_NETWORK:-local}"
TOP_UP_TRIGGER_T="${TOP_UP_TRIGGER_T:-2}"
TOP_UP_TARGET_T="${TOP_UP_TARGET_T:-5}"

TRIGGER_CYCLES=$(( TOP_UP_TRIGGER_T * 1000000000000 ))
TOP_UP_AMOUNT=$(( TOP_UP_TARGET_T  * 1000000000000 ))

CANISTERS=(members governance treasury documents announcements)

echo "============================================"
echo "  Quorum — Cycle Top-Up Watchdog"
echo "  Network   : $DFX_NETWORK"
echo "  Trigger   : ${TOP_UP_TRIGGER_T}T cycles"
echo "  Top-up by : ${TOP_UP_TARGET_T}T cycles"
$DRY_RUN && echo "  Mode      : DRY RUN"
echo "============================================"

if ! dfx ping 2>/dev/null; then
  echo "❌  dfx is not running"
  exit 1
fi

TOPPED_UP=()
FAILED=()

for CANISTER in "${CANISTERS[@]}"; do
  CANISTER_ID=$(dfx canister id "$CANISTER" --network "$DFX_NETWORK" 2>/dev/null || echo "")
  [ -z "$CANISTER_ID" ] && continue

  STATUS_OUT=$(dfx canister status "$CANISTER" --network "$DFX_NETWORK" 2>&1 || echo "")
  CYCLES_RAW=$(echo "$STATUS_OUT" | grep -i "^Cycles:" | head -1 | awk '{print $2}' | tr -d '_,')

  if [ -z "$CYCLES_RAW" ] || ! [[ "$CYCLES_RAW" =~ ^[0-9]+$ ]]; then
    echo "  ❓  $CANISTER — balance unknown"
    continue
  fi

  if [ "$CYCLES_RAW" -lt "$TRIGGER_CYCLES" ]; then
    echo "  🔴  $CANISTER — $CYCLES_RAW cycles → topping up"
    if $DRY_RUN; then
      echo "      [DRY RUN] would deposit ${TOP_UP_TARGET_T}T cycles"
      TOPPED_UP+=("$CANISTER (dry-run)")
    else
      if dfx canister deposit-cycles "$TOP_UP_AMOUNT" "$CANISTER" --network "$DFX_NETWORK" 2>&1; then
        echo "      ✅  Topped up with ${TOP_UP_TARGET_T}T cycles"
        TOPPED_UP+=("$CANISTER")
      else
        echo "      ❌  Top-up failed"
        FAILED+=("$CANISTER")
      fi
    fi
  else
    echo "  🟢  $CANISTER — $CYCLES_RAW cycles (OK)"
  fi
done

echo ""
echo "  Topped up : ${#TOPPED_UP[@]} — ${TOPPED_UP[*]:-none}"
echo "  Failed    : ${#FAILED[@]}    — ${FAILED[*]:-none}"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "❌  Some top-ups failed: ${FAILED[*]}"
  exit 1
fi

echo ""
echo "✅  Cycle watchdog complete"
exit 0
