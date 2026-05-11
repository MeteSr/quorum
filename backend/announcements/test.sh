#!/usr/bin/env bash
# Quorum — Announcements Canister Integration Tests
# Covers: post, getAll, getActive, getUrgent, delete, expiry filter.
# Run: icp network start -d && bash scripts/deploy.sh && bash backend/announcements/test.sh
set -euo pipefail

CANISTER="announcements"
echo "============================================"
echo "  Quorum — Announcements Canister Tests"
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

# Timestamps
FUTURE=$(( ($(date +%s) + 365 * 86400) * 1000000000 ))
PAST=$(( ($(date +%s) - 86400) * 1000000000 ))

# ─── [1] post — Normal announcement ─────────────────────────────────────────
echo ""
echo "── [1] post — Normal announcement ─────────────────────────────────────"
ANN_OUT=$(icp canister call $CANISTER post '(
  "Pool Closure Notice",
  "The community pool will be closed for maintenance May 20-22.",
  variant { Normal },
  null
)' -e local)
echo "$ANN_OUT"
ANN_ID=$(echo "$ANN_OUT" | grep -oP '"ANN_[0-9]+"' | head -1 | tr -d '"')
echo "  → Announcement ID: $ANN_ID"
if [ -n "$ANN_ID" ]; then
  echo "  ✓ Normal announcement posted"
else
  echo "  ↳ ❌ Could not extract announcement ID"
  exit 1
fi

# ─── [2] post — Urgent announcement ─────────────────────────────────────────
echo ""
echo "── [2] post — Urgent announcement ─────────────────────────────────────"
URG_OUT=$(icp canister call $CANISTER post "(
  \"Water Shutoff Alert\",
  \"Emergency water shutoff tonight 10pm-2am for pipe repair.\",
  variant { Urgent },
  opt $FUTURE
)" -e local)
echo "$URG_OUT"
URG_ID=$(echo "$URG_OUT" | grep -oP '"ANN_[0-9]+"' | head -1 | tr -d '"')
echo "  → Urgent ID: $URG_ID"

# ─── [3] post — already expired announcement ─────────────────────────────────
echo ""
echo "── [3] post — announcement with past expiry ────────────────────────────"
icp canister call $CANISTER post "(
  \"Old Notice\",
  \"This already expired.\",
  variant { Normal },
  opt $PAST
)" -e local > /dev/null
echo "  ✓ Expired announcement posted"

# ─── [4] getAll ──────────────────────────────────────────────────────────────
echo ""
echo "── [4] getAll — expect 3 announcements ────────────────────────────────"
ALL_OUT=$(icp canister call $CANISTER getAll -e local)
echo "$ALL_OUT"
ALL_COUNT=$(echo "$ALL_OUT" | grep -c "ANN_" || true)
echo "  → Total: $ALL_COUNT"
if [ "$ALL_COUNT" -ge 3 ]; then
  echo "  ✓ All 3 announcements returned"
else
  echo "  ↳ ❌ Expected ≥ 3 announcements in getAll"
  exit 1
fi

# ─── [5] getActive — excludes expired ────────────────────────────────────────
echo ""
echo "── [5] getActive — should exclude the expired notice ───────────────────"
ACTIVE_OUT=$(icp canister call $CANISTER getActive -e local)
echo "$ACTIVE_OUT"
ACTIVE_COUNT=$(echo "$ACTIVE_OUT" | grep -c "ANN_" || true)
echo "  → Active: $ACTIVE_COUNT"
if [ "$ACTIVE_COUNT" -ge 2 ]; then
  echo "  ✓ Active announcements returned (expired excluded)"
else
  echo "  ↳ ❌ Expected ≥ 2 active (unexpired) announcements"
  exit 1
fi
if echo "$ACTIVE_OUT" | grep -q "Old Notice"; then
  echo "  ↳ ❌ Expired announcement should not appear in getActive"
  exit 1
else
  echo "  ✓ Expired announcement absent from getActive"
fi

# ─── [6] getUrgent ───────────────────────────────────────────────────────────
echo ""
echo "── [6] getUrgent — should return only the water shutoff alert ──────────"
URGENT_OUT=$(icp canister call $CANISTER getUrgent -e local)
echo "$URGENT_OUT"
if echo "$URGENT_OUT" | grep -q "Water Shutoff"; then
  echo "  ✓ Urgent announcement found"
else
  echo "  ↳ ❌ Expected Water Shutoff Alert in getUrgent"
  exit 1
fi
if echo "$URGENT_OUT" | grep -q "Pool Closure"; then
  echo "  ↳ ❌ Normal announcement should not appear in getUrgent"
  exit 1
else
  echo "  ✓ Normal announcement absent from getUrgent"
fi

# ─── [7] getAnnouncement ─────────────────────────────────────────────────────
echo ""
echo "── [7] getAnnouncement by ID ───────────────────────────────────────────"
GET_OUT=$(icp canister call $CANISTER getAnnouncement "(\"$ANN_ID\")" -e local)
echo "$GET_OUT"
if echo "$GET_OUT" | grep -q "Pool Closure"; then
  echo "  ✓ Announcement retrieved by ID"
else
  echo "  ↳ ❌ Expected Pool Closure Notice"
  exit 1
fi

# ─── [8] delete ──────────────────────────────────────────────────────────────
echo ""
echo "── [8] delete announcement ─────────────────────────────────────────────"
DEL_OUT=$(icp canister call $CANISTER delete "(\"$ANN_ID\")" -e local)
echo "$DEL_OUT"
if echo "$DEL_OUT" | grep -q "ok"; then
  echo "  ✓ Announcement deleted"
else
  echo "  ↳ ❌ Expected ok from delete"
  exit 1
fi

# ─── [9] getAll after delete — should have 2 ─────────────────────────────────
echo ""
echo "── [9] getAll after delete — expect 2 remaining ────────────────────────"
AFTER_DEL=$(icp canister call $CANISTER getAll -e local)
AFTER_COUNT=$(echo "$AFTER_DEL" | grep -c "ANN_" || true)
echo "  → Remaining: $AFTER_COUNT"
if [ "$AFTER_COUNT" -ge 2 ]; then
  echo "  ✓ Correct count after deletion"
else
  echo "  ↳ ❌ Expected ≥ 2 announcements remaining"
  exit 1
fi

# ─── [V1] post empty title → InvalidInput ────────────────────────────────────
echo ""
echo "── [V1] post empty title → expect InvalidInput ─────────────────────────"
icp canister call $CANISTER post '("", "body", variant { Normal }, null)' -e local \
  && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for empty title"

# ─── [V2] delete unknown ID → NotFound ────────────────────────────────────────
echo ""
echo "── [V2] delete unknown ID → expect NotFound ────────────────────────────"
icp canister call $CANISTER delete '("ANN_9999")' -e local \
  && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

echo ""
echo "✅  Announcements canister tests passed"
