#!/usr/bin/env bash
# Quorum — Wallet Cycles Pre-flight Check
#
# Verifies the deploy identity's cycles wallet has enough cycles before deploy.
#
# Usage: bash scripts/check-wallet-balance.sh
# Environment:
#   DFX_IDENTITY_PEM  — PEM content for the deploy identity
#   DFX_NETWORK       — target network (default: ic)
#   MIN_WALLET_CYCLES — minimum required cycles (default: 5T)

set -uo pipefail

DFX_NETWORK="${DFX_NETWORK:-ic}"
MIN_WALLET_CYCLES="${MIN_WALLET_CYCLES:-5000000000000}"

if [ -n "${DFX_IDENTITY_PEM:-}" ]; then
  PEM_FILE=$(mktemp /tmp/ci-identity-XXXXXX.pem)
  trap 'rm -f "$PEM_FILE"' EXIT
  printf '%s' "$DFX_IDENTITY_PEM" > "$PEM_FILE"
  dfx identity import --storage-mode=plaintext ci-deploy "$PEM_FILE" 2>/dev/null || true
  dfx identity use ci-deploy
  if [ -n "${DFX_WALLET_ID:-}" ]; then
    dfx identity set-wallet "$DFX_WALLET_ID" --network "$DFX_NETWORK"
  fi
fi

echo "============================================"
echo "  Quorum — Wallet Pre-flight Check"
echo "  Network : $DFX_NETWORK"
echo "  Minimum : $MIN_WALLET_CYCLES cycles"
echo "============================================"

BALANCE_OUT=$(dfx wallet balance --network "$DFX_NETWORK" 2>&1)
if [ $? -ne 0 ]; then
  echo "❌  Could not query wallet balance: $BALANCE_OUT"
  exit 1
fi

if echo "$BALANCE_OUT" | grep -qi "TC\|trillion"; then
  TC=$(echo "$BALANCE_OUT" | grep -oE '[0-9]+\.[0-9]+|[0-9]+' | head -1)
  BALANCE=$(echo "$TC * 1000000000000" | bc | cut -d. -f1)
else
  BALANCE=$(echo "$BALANCE_OUT" | grep -oE '[0-9]+' | head -1)
fi

if [ -z "$BALANCE" ] || ! [[ "$BALANCE" =~ ^[0-9]+$ ]]; then
  echo "❌  Could not parse wallet balance from: $BALANCE_OUT"
  exit 1
fi

echo "  Wallet balance: $BALANCE cycles"

if [ "$BALANCE" -lt "$MIN_WALLET_CYCLES" ]; then
  echo ""
  echo "❌  INSUFFICIENT CYCLES — need at least $MIN_WALLET_CYCLES cycles."
  exit 1
fi

echo ""
echo "✅  Wallet pre-flight passed."
exit 0
