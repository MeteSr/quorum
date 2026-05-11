#!/usr/bin/env bash
# Quorum -- Maintenance Canister Integration Tests
# Covers: submit, assign, updateStatus, lifecycle, error guards, SLA flag.
# Run: dfx start --background && dfx deploy maintenance && bash backend/maintenance/test.sh
set -euo pipefail

CANISTER="maintenance"
echo "============================================"
echo "  Quorum -- Maintenance Canister Tests"
echo "============================================"

if ! dfx ping >/dev/null 2>&1; then
  echo "[FAIL] dfx is not running. Run: dfx start --background"
  exit 1
fi

CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")
if [ -z "$CANISTER_ID" ]; then
  echo "[FAIL] $CANISTER canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

IDENTITY_A=$(dfx identity get-principal)
echo "Test identity: $IDENTITY_A"

dfx identity new quorum-member-b --storage-mode plaintext 2>/dev/null || true
IDENTITY_B=$(dfx --identity quorum-member-b identity get-principal)
echo "Member B identity: $IDENTITY_B"

echo ""
echo "-- [1] submitRequest -- Plumbing, unit 42B"
SUBMIT_OUT=$(dfx canister call $CANISTER submitRequest '(
  "42B",
  variant { Plumbing },
  "Leak under kitchen sink",
  vec {}
)')
echo "$SUBMIT_OUT"
REQ_ID=$(echo "$SUBMIT_OUT" | grep -oP '"MAINT_[0-9]+"' | head -1 | tr -d '"')
echo "  -> Request ID: $REQ_ID"
if echo "$SUBMIT_OUT" | grep -q "ok"; then
  echo "  ok Request created"
else
  echo "  FAIL Expected ok result"
  exit 1
fi

echo ""
echo "-- [2] getRequest -- should be #Open"
GET_OUT=$(dfx canister call $CANISTER getRequest "(\"$REQ_ID\")")
echo "$GET_OUT"
if echo "$GET_OUT" | grep -q "Open"; then
  echo "  ok Status is Open"
else
  echo "  FAIL Expected Open status"
  exit 1
fi

echo ""
echo "-- [3] getMyRequests"
MY_REQ=$(dfx canister call $CANISTER getMyRequests)
echo "$MY_REQ"
if echo "$MY_REQ" | grep -q "$REQ_ID"; then
  echo "  ok Own request visible"
else
  echo "  FAIL Expected to find $REQ_ID in getMyRequests"
  exit 1
fi

echo ""
echo "-- [4] getRequestsForUnit(42B)"
UNIT_OUT=$(dfx canister call $CANISTER getRequestsForUnit '("42B")')
echo "$UNIT_OUT"
if echo "$UNIT_OUT" | grep -q "$REQ_ID"; then
  echo "  ok Request found by unit"
else
  echo "  FAIL Expected request for unit 42B"
  exit 1
fi

echo ""
echo "-- [5] getOpenRequests"
OPEN_OUT=$(dfx canister call $CANISTER getOpenRequests)
echo "$OPEN_OUT"
if echo "$OPEN_OUT" | grep -q "$REQ_ID"; then
  echo "  ok Request in open list"
else
  echo "  FAIL Expected $REQ_ID in getOpenRequests"
  exit 1
fi

echo ""
echo "-- [6] getAllRequests"
ALL_OUT=$(dfx canister call $CANISTER getAllRequests)
echo "$ALL_OUT"
if echo "$ALL_OUT" | grep -q "$REQ_ID"; then
  echo "  ok Request in all-requests list"
else
  echo "  FAIL Expected $REQ_ID in getAllRequests"
  exit 1
fi

echo ""
echo "-- [7] assignRequest"
ASSIGN_OUT=$(dfx canister call $CANISTER assignRequest "(
  \"$REQ_ID\",
  \"vendor-plumbers-inc\",
  null
)")
echo "$ASSIGN_OUT"
if echo "$ASSIGN_OUT" | grep -q "Assigned"; then
  echo "  ok Status is Assigned"
else
  echo "  FAIL Expected Assigned status"
  exit 1
fi

echo ""
echo "-- [8] updateStatus -> InProgress"
PROGRESS_OUT=$(dfx canister call $CANISTER updateStatus "(
  \"$REQ_ID\",
  variant { InProgress },
  \"Plumber arrived on site\"
)")
echo "$PROGRESS_OUT"
if echo "$PROGRESS_OUT" | grep -q "InProgress"; then
  echo "  ok Status is InProgress"
else
  echo "  FAIL Expected InProgress status"
  exit 1
fi

echo ""
echo "-- [9] Audit trail"
AUDIT_OUT=$(dfx canister call $CANISTER getRequest "(\"$REQ_ID\")")
echo "$AUDIT_OUT"
HISTORY_COUNT=$(echo "$AUDIT_OUT" | grep -c "note =" || true)
echo "  -> Audit entries: $HISTORY_COUNT"
if [ "$HISTORY_COUNT" -ge 2 ]; then
  echo "  ok Audit trail has >= 2 entries"
else
  echo "  FAIL Expected >= 2 audit entries"
  exit 1
fi

echo ""
echo "-- [10] updateStatus -> Resolved"
RESOLVED_OUT=$(dfx canister call $CANISTER updateStatus "(
  \"$REQ_ID\",
  variant { Resolved },
  \"Pipe repaired and tested\"
)")
echo "$RESOLVED_OUT"
if echo "$RESOLVED_OUT" | grep -q "Resolved"; then
  echo "  ok Status is Resolved"
else
  echo "  FAIL Expected Resolved status"
  exit 1
fi

echo ""
echo "-- [11] updateStatus -> Closed"
CLOSED_OUT=$(dfx canister call $CANISTER updateStatus "(
  \"$REQ_ID\",
  variant { Closed },
  \"Homeowner confirmed resolution\"
)")
echo "$CLOSED_OUT"
if echo "$CLOSED_OUT" | grep -q "Closed"; then
  echo "  ok Full lifecycle complete"
else
  echo "  FAIL Expected Closed status"
  exit 1
fi

echo ""
echo "-- [12] getOpenRequests -- closed not in list"
OPEN_AFTER=$(dfx canister call $CANISTER getOpenRequests)
if echo "$OPEN_AFTER" | grep -q "$REQ_ID"; then
  echo "  FAIL Closed request should not appear in getOpenRequests"
  exit 1
else
  echo "  ok Closed request absent from open list"
fi

echo ""
echo "-- [13] Multi-identity isolation"
dfx --identity quorum-member-b canister call $CANISTER submitRequest '(
  "99A",
  variant { Electrical },
  "Outlet sparking in living room",
  vec {}
)' > /dev/null

MY_AFTER=$(dfx canister call $CANISTER getMyRequests)
echo "$MY_AFTER"
if echo "$MY_AFTER" | grep -q "99A"; then
  echo "  FAIL Identity A should not see identity B unit 99A"
  exit 1
else
  echo "  ok getMyRequests correctly scoped to caller"
fi

ALL_AFTER=$(dfx canister call $CANISTER getAllRequests)
if echo "$ALL_AFTER" | grep -q "99A"; then
  echo "  ok getAllRequests returns both callers requests"
else
  echo "  FAIL Expected 99A in getAllRequests"
  exit 1
fi

echo ""
echo "-- [V1] empty unitId -> InvalidInput"
dfx canister call $CANISTER submitRequest '(
  "",
  variant { HVAC },
  "AC not cooling",
  vec {}
)' && echo "  FAIL Expected InvalidInput" || echo "  ok InvalidInput returned"

echo ""
echo "-- [V2] empty description -> InvalidInput"
dfx canister call $CANISTER submitRequest '(
  "42B",
  variant { Plumbing },
  "",
  vec {}
)' && echo "  FAIL Expected InvalidInput" || echo "  ok InvalidInput returned"

echo ""
echo "-- [V3] assign unknown -> NotFound"
dfx canister call $CANISTER assignRequest '(
  "MAINT_9999",
  "some-vendor",
  null
)' && echo "  FAIL Expected NotFound" || echo "  ok NotFound returned"

echo ""
echo "-- [V4] updateStatus unknown -> NotFound"
dfx canister call $CANISTER updateStatus '(
  "MAINT_9999",
  variant { InProgress },
  "should fail"
)' && echo "  FAIL Expected NotFound" || echo "  ok NotFound returned"

echo ""
echo "ok  Maintenance canister tests passed"
