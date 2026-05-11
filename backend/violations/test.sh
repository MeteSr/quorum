#!/usr/bin/env bash
# Backend integration tests for the violations canister.
# Requires a running dfx replica with the violations canister deployed.
set -euo pipefail

CANISTER="violations"
PASS=0
FAIL=0

canister_id() { dfx canister id "$CANISTER" 2>/dev/null || echo ""; }
call()        { dfx canister call "$CANISTER" "$@"; }

pass() { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
assert_contains() {
  local label="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -qF "$expected"; then pass "$label"
  else fail "$label — expected «$expected» in «$actual»"; fi
}

echo "=== violations canister tests ==="

if ! dfx ping >/dev/null 2>&1; then
  echo "❌  Local dfx replica is not running. Run: dfx start --background"
  exit 1
fi

CANISTER_ID=$(canister_id)
if [ -z "$CANISTER_ID" ]; then
  echo "  SKIP — violations canister not deployed"
  exit 0
fi

# ── createViolation ───────────────────────────────────────────────────────────

OUT=$(call createViolation '("unit-4B", variant { Parking }, "Vehicle blocking fire lane", opt "abc123")' 2>&1)
assert_contains "createViolation returns ok" "ok" "$OUT"
assert_contains "createViolation sets status Open" "Open" "$OUT"
assert_contains "createViolation stores unitId" "unit-4B" "$OUT"

VIO_ID=$(echo "$OUT" | grep -oE '"VIO_[0-9]+"' | tr -d '"' | head -1)

OUT=$(call createViolation '("", variant { Noise }, "description", null)' 2>&1)
assert_contains "createViolation rejects empty unitId" "InvalidInput" "$OUT"

OUT=$(call createViolation '("unit-4B", variant { Noise }, "", null)' 2>&1)
assert_contains "createViolation rejects empty description" "InvalidInput" "$OUT"

# ── getViolation ──────────────────────────────────────────────────────────────

OUT=$(call getViolation "(\"$VIO_ID\")" 2>&1)
assert_contains "getViolation finds created violation" "unit-4B" "$OUT"

OUT=$(call getViolation '"VIO_9999"' 2>&1)
assert_contains "getViolation returns null for unknown id" "null" "$OUT"

# ── getViolationsForUnit ──────────────────────────────────────────────────────

OUT=$(call getViolationsForUnit '"unit-4B"' 2>&1)
assert_contains "getViolationsForUnit returns violations for unit" "unit-4B" "$OUT"

OUT=$(call getViolationsForUnit '"unit-ZZZ"' 2>&1)
assert_contains "getViolationsForUnit returns empty for unknown unit" "vec {}" "$OUT"

# ── getAllViolations ──────────────────────────────────────────────────────────

OUT=$(call getAllViolations 2>&1)
assert_contains "getAllViolations returns non-empty list" "unit-4B" "$OUT"

# ── addReply ──────────────────────────────────────────────────────────────────

OUT=$(call addReply "(\"$VIO_ID\", \"We will investigate.\")" 2>&1)
assert_contains "addReply returns ok" "ok" "$OUT"
assert_contains "addReply stores reply text" "We will investigate." "$OUT"

OUT=$(call addReply '"VIO_9999", "text"' 2>&1)
assert_contains "addReply returns NotFound for unknown violation" "NotFound" "$OUT"

# ── updateStatus ─────────────────────────────────────────────────────────────

OUT=$(call updateStatus "(\"$VIO_ID\", variant { UnderReview })" 2>&1)
assert_contains "updateStatus sets UnderReview" "UnderReview" "$OUT"

OUT=$(call updateStatus "(\"$VIO_ID\", variant { Resolved })" 2>&1)
assert_contains "updateStatus sets Resolved" "Resolved" "$OUT"

OUT=$(call updateStatus '("VIO_9999", variant { Resolved })' 2>&1)
assert_contains "updateStatus returns NotFound for unknown violation" "NotFound" "$OUT"

# ── getMyViolations ───────────────────────────────────────────────────────────

OUT=$(call getMyViolations 2>&1)
assert_contains "getMyViolations returns caller violations" "unit-4B" "$OUT"

# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
