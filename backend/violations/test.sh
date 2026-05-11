#!/usr/bin/env bash
# Quorum — Violations Canister Integration Tests
# Covers: createViolation, getViolation, getViolationsForUnit, getAllViolations,
# addReply, updateStatus, getMyViolations, input validation guards.
# Run: dfx start --background && dfx deploy violations && bash backend/violations/test.sh
set -euo pipefail

CANISTER="violations"
echo "============================================"
echo "  Quorum — Violations Canister Tests"
echo "============================================"

if ! dfx ping >/dev/null 2>&1; then
  echo "❌ dfx is not running. Run: dfx start --background"
  exit 1
fi

CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")
if [ -z "$CANISTER_ID" ]; then
  echo "❌ $CANISTER canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

# ─── [1] createViolation ─────────────────────────────────────────────────────
echo ""
echo "── [1] createViolation ─────────────────────────────────────────────────"
CREATE_OUT=$(dfx canister call $CANISTER createViolation '(
  "unit-4B",
  variant { Parking },
  "Vehicle blocking fire lane",
  opt "abc123"
)' 2>&1)
echo "$CREATE_OUT"
if echo "$CREATE_OUT" | grep -q "ok"; then
  echo "  ✓ createViolation returned ok"
else
  echo "  ↳ ❌ Expected ok result"
  exit 1
fi
if echo "$CREATE_OUT" | grep -q "Open"; then
  echo "  ✓ Status is Open"
else
  echo "  ↳ ❌ Expected Open status"
  exit 1
fi
if echo "$CREATE_OUT" | grep -q "unit-4B"; then
  echo "  ✓ unitId stored"
else
  echo "  ↳ ❌ Expected unit-4B in response"
  exit 1
fi

VIO_ID=$(echo "$CREATE_OUT" | grep -oE '"VIO_[0-9]+"' | tr -d '"' | head -1)
echo "  → Violation ID: $VIO_ID"
if [ -z "$VIO_ID" ]; then
  echo "  ↳ ❌ Could not extract violation ID"
  exit 1
fi

# ─── [2] getViolation ────────────────────────────────────────────────────────
echo ""
echo "── [2] getViolation ────────────────────────────────────────────────────"
GET_OUT=$(dfx canister call $CANISTER getViolation "(\"$VIO_ID\")" 2>&1)
echo "$GET_OUT"
if echo "$GET_OUT" | grep -q "unit-4B"; then
  echo "  ✓ Violation retrieved by ID"
else
  echo "  ↳ ❌ Expected unit-4B in getViolation response"
  exit 1
fi

NULL_OUT=$(dfx canister call $CANISTER getViolation '"VIO_9999"' 2>&1)
echo "$NULL_OUT"
if echo "$NULL_OUT" | grep -q "null"; then
  echo "  ✓ Returns null for unknown ID"
else
  echo "  ↳ ❌ Expected null for unknown violation ID"
  exit 1
fi

# ─── [3] getViolationsForUnit ────────────────────────────────────────────────
echo ""
echo "── [3] getViolationsForUnit ────────────────────────────────────────────"
UNIT_OUT=$(dfx canister call $CANISTER getViolationsForUnit '"unit-4B"' 2>&1)
echo "$UNIT_OUT"
if echo "$UNIT_OUT" | grep -q "unit-4B"; then
  echo "  ✓ Returns violations for unit-4B"
else
  echo "  ↳ ❌ Expected unit-4B in getViolationsForUnit response"
  exit 1
fi

EMPTY_OUT=$(dfx canister call $CANISTER getViolationsForUnit '"unit-ZZZ"' 2>&1)
echo "$EMPTY_OUT"
if echo "$EMPTY_OUT" | grep -q "vec {}"; then
  echo "  ✓ Returns empty vec for unknown unit"
else
  echo "  ↳ ❌ Expected vec {} for unknown unit"
  exit 1
fi

# ─── [4] getAllViolations ────────────────────────────────────────────────────
echo ""
echo "── [4] getAllViolations ─────────────────────────────────────────────────"
ALL_OUT=$(dfx canister call $CANISTER getAllViolations 2>&1)
echo "$ALL_OUT"
if echo "$ALL_OUT" | grep -q "unit-4B"; then
  echo "  ✓ getAllViolations returns non-empty list"
else
  echo "  ↳ ❌ Expected unit-4B in getAllViolations"
  exit 1
fi

# ─── [5] addReply ────────────────────────────────────────────────────────────
echo ""
echo "── [5] addReply ────────────────────────────────────────────────────────"
REPLY_OUT=$(dfx canister call $CANISTER addReply "(\"$VIO_ID\", \"We will investigate.\")" 2>&1)
echo "$REPLY_OUT"
if echo "$REPLY_OUT" | grep -q "ok"; then
  echo "  ✓ addReply returned ok"
else
  echo "  ↳ ❌ Expected ok from addReply"
  exit 1
fi
if echo "$REPLY_OUT" | grep -q "We will investigate."; then
  echo "  ✓ Reply text stored"
else
  echo "  ↳ ❌ Expected reply text in response"
  exit 1
fi

# ─── [6] updateStatus ────────────────────────────────────────────────────────
echo ""
echo "── [6] updateStatus → UnderReview ──────────────────────────────────────"
REVIEW_OUT=$(dfx canister call $CANISTER updateStatus "(\"$VIO_ID\", variant { UnderReview })" 2>&1)
echo "$REVIEW_OUT"
if echo "$REVIEW_OUT" | grep -q "UnderReview"; then
  echo "  ✓ Status is UnderReview"
else
  echo "  ↳ ❌ Expected UnderReview status"
  exit 1
fi

echo ""
echo "── [7] updateStatus → Resolved ─────────────────────────────────────────"
RESOLVED_OUT=$(dfx canister call $CANISTER updateStatus "(\"$VIO_ID\", variant { Resolved })" 2>&1)
echo "$RESOLVED_OUT"
if echo "$RESOLVED_OUT" | grep -q "Resolved"; then
  echo "  ✓ Status is Resolved"
else
  echo "  ↳ ❌ Expected Resolved status"
  exit 1
fi

# ─── [8] getMyViolations ─────────────────────────────────────────────────────
echo ""
echo "── [8] getMyViolations ──────────────────────────────────────────────────"
MY_OUT=$(dfx canister call $CANISTER getMyViolations 2>&1)
echo "$MY_OUT"
if echo "$MY_OUT" | grep -q "unit-4B"; then
  echo "  ✓ getMyViolations returns caller violations"
else
  echo "  ↳ ❌ Expected unit-4B in getMyViolations"
  exit 1
fi

# ─── [V1] empty unitId → InvalidInput ────────────────────────────────────────
echo ""
echo "── [V1] empty unitId → expect InvalidInput ─────────────────────────────"
dfx canister call $CANISTER createViolation '(
  "",
  variant { Noise },
  "description",
  null
)' && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned"

# ─── [V2] empty description → InvalidInput ───────────────────────────────────
echo ""
echo "── [V2] empty description → expect InvalidInput ────────────────────────"
dfx canister call $CANISTER createViolation '(
  "unit-4B",
  variant { Noise },
  "",
  null
)' && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned"

# ─── [V3] addReply on unknown violation → NotFound ───────────────────────────
echo ""
echo "── [V3] addReply unknown → expect NotFound ─────────────────────────────"
dfx canister call $CANISTER addReply '(
  "VIO_9999",
  "text"
)' && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

# ─── [V4] updateStatus on unknown violation → NotFound ───────────────────────
echo ""
echo "── [V4] updateStatus unknown → expect NotFound ─────────────────────────"
dfx canister call $CANISTER updateStatus '(
  "VIO_9999",
  variant { Resolved }
)' && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

echo ""
echo "✅  Violations canister tests passed"
