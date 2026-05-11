#!/usr/bin/env bash
# Quorum — Maintenance Canister Integration Tests
# Covers: submit, assign, updateStatus, lifecycle, error guards, SLA flag.
# Run against a local replica: icp network start -d && bash scripts/deploy.sh && bash backend/maintenance/test.sh
set -euo pipefail

CANISTER="maintenance"
echo "============================================"
echo "  Quorum — Maintenance Canister Tests"
echo "============================================"

if ! icp network ping local >/dev/null 2>&1; then
  echo "❌ Local ICP network is not running. Run: icp network start -d"
  exit 1
fi

CANISTER_ID=$(icp canister id "$CANISTER" -e local 2>/dev/null || echo "")
if [ -z "$CANISTER_ID" ]; then
  echo "❌ $CANISTER canister not deployed. Run: bash scripts/deploy.sh"
  exit 1
fi

IDENTITY_A=$(icp identity principal 2>/dev/null || echo "")
echo "Test identity: $IDENTITY_A"

# Ensure a second test identity for multi-caller tests
if ! icp identity list 2>/dev/null | grep -q "^quorum-member-b$"; then
  icp identity new quorum-member-b --storage plaintext 2>/dev/null || true
fi
IDENTITY_B=$(icp identity principal --identity quorum-member-b 2>/dev/null || echo "")
echo "Member B identity: $IDENTITY_B"

# ─── [1] Submit a request ────────────────────────────────────────────────────
echo ""
echo "── [1] submitRequest — Plumbing, unit 42B ─────────────────────────────"
SUBMIT_OUT=$(icp canister call $CANISTER submitRequest '(
  "42B",
  variant { Plumbing },
  "Leak under kitchen sink",
  vec {}
)' -e local)
echo "$SUBMIT_OUT"
REQ_ID=$(echo "$SUBMIT_OUT" | grep -oP '"MAINT_[0-9]+"' | head -1 | tr -d '"')
echo "  → Request ID: $REQ_ID"
if echo "$SUBMIT_OUT" | grep -q "ok"; then
  echo "  ✓ Request created"
else
  echo "  ↳ ❌ Expected ok result"
  exit 1
fi

# ─── [2] Verify #Open status ─────────────────────────────────────────────────
echo ""
echo "── [2] getRequest — should be #Open, slaWarning = false ──────────────"
GET_OUT=$(icp canister call $CANISTER getRequest "(\"$REQ_ID\")" -e local)
echo "$GET_OUT"
if echo "$GET_OUT" | grep -q "Open"; then
  echo "  ✓ Status is Open"
else
  echo "  ↳ ❌ Expected Open status"
  exit 1
fi
if echo "$GET_OUT" | grep -q "slaWarning = false"; then
  echo "  ✓ SLA warning not triggered (new request)"
else
  echo "  ↳ ❌ Expected slaWarning = false"
fi

# ─── [3] getMyRequests — caller sees own request ─────────────────────────────
echo ""
echo "── [3] getMyRequests — caller sees own request ────────────────────────"
MY_REQ=$(icp canister call $CANISTER getMyRequests -e local)
echo "$MY_REQ"
if echo "$MY_REQ" | grep -q "$REQ_ID"; then
  echo "  ✓ Own request visible"
else
  echo "  ↳ ❌ Expected to find $REQ_ID in getMyRequests"
  exit 1
fi

# ─── [4] getRequestsForUnit ─────────────────────────────────────────────────
echo ""
echo "── [4] getRequestsForUnit(\"42B\") ─────────────────────────────────────"
UNIT_OUT=$(icp canister call $CANISTER getRequestsForUnit '("42B")' -e local)
echo "$UNIT_OUT"
if echo "$UNIT_OUT" | grep -q "$REQ_ID"; then
  echo "  ✓ Request found by unit"
else
  echo "  ↳ ❌ Expected request for unit 42B"
  exit 1
fi

# ─── [5] getOpenRequests ────────────────────────────────────────────────────
echo ""
echo "── [5] getOpenRequests — should include the new request ───────────────"
OPEN_OUT=$(icp canister call $CANISTER getOpenRequests -e local)
echo "$OPEN_OUT"
if echo "$OPEN_OUT" | grep -q "$REQ_ID"; then
  echo "  ✓ Request in open list"
else
  echo "  ↳ ❌ Expected $REQ_ID in getOpenRequests"
  exit 1
fi

# ─── [6] getAllRequests ──────────────────────────────────────────────────────
echo ""
echo "── [6] getAllRequests ──────────────────────────────────────────────────"
ALL_OUT=$(icp canister call $CANISTER getAllRequests -e local)
echo "$ALL_OUT"
if echo "$ALL_OUT" | grep -q "$REQ_ID"; then
  echo "  ✓ Request in all-requests list"
else
  echo "  ↳ ❌ Expected $REQ_ID in getAllRequests"
  exit 1
fi

# ─── [7] assignRequest ──────────────────────────────────────────────────────
echo ""
echo "── [7] assignRequest — assign to vendor-plumbers-inc ──────────────────"
ASSIGN_OUT=$(icp canister call $CANISTER assignRequest "(
  \"$REQ_ID\",
  \"vendor-plumbers-inc\",
  null
)" -e local)
echo "$ASSIGN_OUT"
if echo "$ASSIGN_OUT" | grep -q "Assigned"; then
  echo "  ✓ Status is Assigned"
else
  echo "  ↳ ❌ Expected Assigned status"
  exit 1
fi
if echo "$ASSIGN_OUT" | grep -q "vendor-plumbers-inc"; then
  echo "  ✓ Vendor ID recorded"
else
  echo "  ↳ ❌ Expected vendor ID in response"
  exit 1
fi

# ─── [8] updateStatus → InProgress ─────────────────────────────────────────
echo ""
echo "── [8] updateStatus → InProgress ─────────────────────────────────────"
PROGRESS_OUT=$(icp canister call $CANISTER updateStatus "(
  \"$REQ_ID\",
  variant { InProgress },
  \"Plumber arrived on site\"
)" -e local)
echo "$PROGRESS_OUT"
if echo "$PROGRESS_OUT" | grep -q "InProgress"; then
  echo "  ✓ Status is InProgress"
else
  echo "  ↳ ❌ Expected InProgress status"
  exit 1
fi

# ─── [9] Audit trail has entries ────────────────────────────────────────────
echo ""
echo "── [9] getRequest — audit trail should have 2 entries ─────────────────"
AUDIT_OUT=$(icp canister call $CANISTER getRequest "(\"$REQ_ID\")" -e local)
echo "$AUDIT_OUT"
HISTORY_COUNT=$(echo "$AUDIT_OUT" | grep -c "note =" || true)
echo "  → Audit entries: $HISTORY_COUNT"
if [ "$HISTORY_COUNT" -ge 2 ]; then
  echo "  ✓ Audit trail has ≥ 2 entries"
else
  echo "  ↳ ❌ Expected ≥ 2 audit entries"
  exit 1
fi

# ─── [10] updateStatus → Resolved ───────────────────────────────────────────
echo ""
echo "── [10] updateStatus → Resolved ──────────────────────────────────────"
RESOLVED_OUT=$(icp canister call $CANISTER updateStatus "(
  \"$REQ_ID\",
  variant { Resolved },
  \"Pipe repaired and tested\"
)" -e local)
echo "$RESOLVED_OUT"
if echo "$RESOLVED_OUT" | grep -q "Resolved"; then
  echo "  ✓ Status is Resolved"
else
  echo "  ↳ ❌ Expected Resolved status"
  exit 1
fi

# ─── [11] updateStatus → Closed (full lifecycle) ────────────────────────────
echo ""
echo "── [11] updateStatus → Closed — full lifecycle complete ───────────────"
CLOSED_OUT=$(icp canister call $CANISTER updateStatus "(
  \"$REQ_ID\",
  variant { Closed },
  \"Homeowner confirmed resolution\"
)" -e local)
echo "$CLOSED_OUT"
if echo "$CLOSED_OUT" | grep -q "Closed"; then
  echo "  ✓ Full lifecycle: Open → Assigned → InProgress → Resolved → Closed"
else
  echo "  ↳ ❌ Expected Closed status"
  exit 1
fi

# ─── [12] getOpenRequests — Closed request not in open list ─────────────────
echo ""
echo "── [12] getOpenRequests — closed request should not appear ────────────"
OPEN_AFTER=$(icp canister call $CANISTER getOpenRequests -e local)
if echo "$OPEN_AFTER" | grep -q "$REQ_ID"; then
  echo "  ↳ ❌ Closed request should not appear in getOpenRequests"
  exit 1
else
  echo "  ✓ Closed request absent from open list"
fi

# ─── [13] Submit second request and submit a third from member B ─────────────
echo ""
echo "── [13] Submit request from member B — getMyRequests isolation ─────────"
icp identity default quorum-member-b 2>/dev/null || true
icp canister call $CANISTER submitRequest '(
  "99A",
  variant { Electrical },
  "Outlet sparking in living room",
  vec {}
)' -e local > /dev/null
icp identity default quorum-local 2>/dev/null || icp identity default "$IDENTITY_A" 2>/dev/null || true

MY_AFTER=$(icp canister call $CANISTER getMyRequests -e local)
echo "$MY_AFTER"
if echo "$MY_AFTER" | grep -q "99A"; then
  echo "  ↳ ❌ Identity A should not see identity B's unit 99A"
  exit 1
else
  echo "  ✓ getMyRequests correctly scoped to caller"
fi

ALL_AFTER=$(icp canister call $CANISTER getAllRequests -e local)
if echo "$ALL_AFTER" | grep -q "99A"; then
  echo "  ✓ getAllRequests returns both callers' requests"
else
  echo "  ↳ ❌ Expected 99A in getAllRequests"
  exit 1
fi

# ─── [V1] submitRequest with empty unitId → InvalidInput ────────────────────
echo ""
echo "── [V1] submitRequest empty unitId → expect InvalidInput ──────────────"
icp canister call $CANISTER submitRequest '(
  "",
  variant { HVAC },
  "AC not cooling",
  vec {}
)' -e local && echo "  ↳ ❌ Expected InvalidInput error" || echo "  ✓ InvalidInput returned for empty unitId"

# ─── [V2] submitRequest with empty description → InvalidInput ───────────────
echo ""
echo "── [V2] submitRequest empty description → expect InvalidInput ──────────"
icp canister call $CANISTER submitRequest '(
  "42B",
  variant { Plumbing },
  "",
  vec {}
)' -e local && echo "  ↳ ❌ Expected InvalidInput error" || echo "  ✓ InvalidInput returned for empty description"

# ─── [V3] assignRequest with unknown ID → NotFound ──────────────────────────
echo ""
echo "── [V3] assignRequest unknown ID → expect NotFound ────────────────────"
icp canister call $CANISTER assignRequest '(
  "MAINT_9999",
  "some-vendor",
  null
)' -e local && echo "  ↳ ❌ Expected NotFound error" || echo "  ✓ NotFound returned for unknown request"

# ─── [V4] updateStatus with unknown ID → NotFound ────────────────────────────
echo ""
echo "── [V4] updateStatus unknown ID → expect NotFound ─────────────────────"
icp canister call $CANISTER updateStatus '(
  "MAINT_9999",
  variant { InProgress },
  "should fail"
)' -e local && echo "  ↳ ❌ Expected NotFound error" || echo "  ✓ NotFound returned for unknown request"

echo ""
echo "✅  Maintenance canister tests passed"
