#!/usr/bin/env bash
# Quorum — ARC (Architectural Review Committee) Canister Tests
#
# Tests: submitRequest, updateStatus (approve/reject), getRequest,
#        getRequestsForUnit, getMyRequests, getAllRequests, invalid-input guards.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANISTER="arc"
CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")

if [ -z "$CANISTER_ID" ]; then
  echo "  ⬜ $CANISTER not deployed — skipping"
  exit 0
fi

echo "============================================"
echo "  ARC Canister — Test Suite"
echo "============================================"
echo "  Canister: $CANISTER_ID"
echo ""

# ── [1] submitRequest — fence ──────────────────────────────────────────────────
echo "── [1] submitRequest (fence) ──"
OUT=$(dfx --identity default canister call "$CANISTER" submitRequest \
  '("unit-5A", variant { Fence }, "Install 6-foot cedar privacy fence along rear lot line.", null)' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "ARC_" || { echo " ↳ ❌ submitRequest did not return ARC id"; exit 1; }
echo " ↳ ok"
echo ""

# Capture request ID for later tests
REQUEST_ID=$(echo "$OUT" | grep -oP 'ARC_\d+' | head -1)
if [ -z "$REQUEST_ID" ]; then
  echo " ↳ ❌ Could not extract request ID from output"
  exit 1
fi
echo "  Request ID: $REQUEST_ID"
echo ""

# ── [2] submitRequest — roof ───────────────────────────────────────────────────
echo "── [2] submitRequest (roof, unit-5A) ──"
OUT=$(dfx --identity default canister call "$CANISTER" submitRequest \
  '("unit-5A", variant { Roof }, "Replace aging asphalt shingles with architectural grade.", null)' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "ARC_" || { echo " ↳ ❌ second submitRequest failed"; exit 1; }
echo " ↳ ok"
echo ""

# ── [3] getAllRequests ─────────────────────────────────────────────────────────
echo "── [3] getAllRequests ──"
OUT=$(dfx --identity default canister call "$CANISTER" getAllRequests 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "ARC_" || { echo " ↳ ❌ getAllRequests returned no records"; exit 1; }
echo " ↳ ok"
echo ""

# ── [4] getRequestsForUnit ────────────────────────────────────────────────────
echo "── [4] getRequestsForUnit(unit-5A) ──"
OUT=$(dfx --identity default canister call "$CANISTER" getRequestsForUnit '("unit-5A")' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "ARC_" || { echo " ↳ ❌ getRequestsForUnit returned no records for unit-5A"; exit 1; }
echo " ↳ ok"
echo ""

# ── [5] getMyRequests ─────────────────────────────────────────────────────────
echo "── [5] getMyRequests (as submitter) ──"
OUT=$(dfx --identity default canister call "$CANISTER" getMyRequests 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "ARC_" || { echo " ↳ ❌ getMyRequests returned no records for submitter"; exit 1; }
echo " ↳ ok"
echo ""

# ── [6] getRequest ────────────────────────────────────────────────────────────
echo "── [6] getRequest($REQUEST_ID) ──"
OUT=$(dfx --identity default canister call "$CANISTER" getRequest "(\"$REQUEST_ID\")" 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "$REQUEST_ID" || { echo " ↳ ❌ getRequest did not return the expected record"; exit 1; }
echo " ↳ ok"
echo ""

# ── [7] updateStatus — approve ────────────────────────────────────────────────
echo "── [7] updateStatus (Approved) ──"
OUT=$(dfx --identity default canister call "$CANISTER" updateStatus \
  "(\"$REQUEST_ID\", variant { Approved }, opt \"Materials meet community standards.\")" 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "Approved" || { echo " ↳ ❌ updateStatus did not return Approved status"; exit 1; }
echo " ↳ ok"
echo ""

# ── [8] updateStatus — reject separate request ────────────────────────────────
SECOND_ID=$(dfx --identity default canister call "$CANISTER" getAllRequests 2>&1 \
  | grep -oP 'ARC_\d+' | tail -1)

echo "── [8] updateStatus (Rejected) on $SECOND_ID ──"
OUT=$(dfx --identity default canister call "$CANISTER" updateStatus \
  "(\"$SECOND_ID\", variant { Rejected }, opt \"Does not meet architectural guidelines.\")" 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "Rejected" || { echo " ↳ ❌ updateStatus did not return Rejected status"; exit 1; }
echo " ↳ ok"
echo ""

# ── Validation guards ─────────────────────────────────────────────────────────
echo "── [V1] submitRequest rejects empty description ──"
OUT=$(dfx --identity default canister call "$CANISTER" submitRequest \
  '("unit-5A", variant { Fence }, "", null)' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "InvalidInput" || { echo " ↳ ❌ empty description was not rejected"; exit 1; }
echo " ↳ ok"
echo ""

echo "── [V2] submitRequest rejects empty unitId ──"
OUT=$(dfx --identity default canister call "$CANISTER" submitRequest \
  '("", variant { Deck }, "Adding a deck.", null)' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "InvalidInput" || { echo " ↳ ❌ empty unitId was not rejected"; exit 1; }
echo " ↳ ok"
echo ""

echo "── [V3] getRequest returns opt null for unknown ID ──"
OUT=$(dfx --identity default canister call "$CANISTER" getRequest '("ARC_9999")' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "null" || { echo " ↳ ❌ unknown request ID should return null"; exit 1; }
echo " ↳ ok"
echo ""

echo "── [V4] updateStatus returns NotFound for unknown ID ──"
OUT=$(dfx --identity default canister call "$CANISTER" updateStatus \
  '("ARC_9999", variant { Approved }, null)' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "NotFound" || { echo " ↳ ❌ unknown ID should return NotFound"; exit 1; }
echo " ↳ ok"
echo ""

echo "============================================"
echo "  ✅  ARC tests passed"
echo "============================================"
