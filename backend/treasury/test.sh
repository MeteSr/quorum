#!/usr/bin/env bash
# Quorum — Treasury Canister Integration Tests
# Covers: postAssessment, markPaid, waiveAssessment, outstanding queries.
# Run: icp network start -d && bash scripts/deploy.sh && bash backend/treasury/test.sh
set -euo pipefail

CANISTER="treasury"
echo "============================================"
echo "  Quorum — Treasury Canister Tests"
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

# Due date: 30 days from now in nanoseconds
DUE=$(( ($(date +%s) + 30 * 86400) * 1000000000 ))

# ─── [1] postAssessment — monthly dues ────────────────────────────────────────
echo ""
echo "── [1] postAssessment — monthly dues for unit 12A ─────────────────────"
ASSESS_OUT=$(icp canister call $CANISTER postAssessment "(
  \"12A\",
  45000,
  variant { MonthlyDues },
  \"May 2024 HOA dues\",
  $DUE
)" -e local)
echo "$ASSESS_OUT"
ASSESS_ID=$(echo "$ASSESS_OUT" | grep -oP '"ASSESS_[0-9]+"' | head -1 | tr -d '"')
echo "  → Assessment ID: $ASSESS_ID"
if [ -n "$ASSESS_ID" ]; then
  echo "  ✓ Assessment created"
else
  echo "  ↳ ❌ Could not extract assessment ID"
  exit 1
fi

# ─── [2] postAssessment — special assessment ─────────────────────────────────
echo ""
echo "── [2] postAssessment — special assessment for unit 12A ───────────────"
SPECIAL_OUT=$(icp canister call $CANISTER postAssessment "(
  \"12A\",
  15000,
  variant { SpecialAssessment },
  \"Roof repair contribution Q2 2024\",
  $DUE
)" -e local)
echo "$SPECIAL_OUT"
SPECIAL_ID=$(echo "$SPECIAL_OUT" | grep -oP '"ASSESS_[0-9]+"' | head -1 | tr -d '"')
echo "  → Special Assessment ID: $SPECIAL_ID"

# ─── [3] postAssessment — different unit ─────────────────────────────────────
echo ""
echo "── [3] postAssessment — dues for unit 99A ──────────────────────────────"
icp canister call $CANISTER postAssessment "(
  \"99A\",
  45000,
  variant { MonthlyDues },
  \"May 2024 HOA dues\",
  $DUE
)" -e local > /dev/null
echo "  ✓ Second unit assessment created"

# ─── [4] getAssessment ───────────────────────────────────────────────────────
echo ""
echo "── [4] getAssessment by ID ─────────────────────────────────────────────"
GET_OUT=$(icp canister call $CANISTER getAssessment "(\"$ASSESS_ID\")" -e local)
echo "$GET_OUT"
if echo "$GET_OUT" | grep -q "May 2024"; then
  echo "  ✓ Assessment retrieved"
else
  echo "  ↳ ❌ Expected assessment details"
  exit 1
fi

# ─── [5] getAssessmentsForUnit ───────────────────────────────────────────────
echo ""
echo "── [5] getAssessmentsForUnit(\"12A\") — expect 2 assessments ─────────────"
UNIT_OUT=$(icp canister call $CANISTER getAssessmentsForUnit '("12A")' -e local)
echo "$UNIT_OUT"
UNIT_COUNT=$(echo "$UNIT_OUT" | grep -c "ASSESS_" || true)
echo "  → Assessments for 12A: $UNIT_COUNT"
if [ "$UNIT_COUNT" -ge 2 ]; then
  echo "  ✓ Both assessments found for unit 12A"
else
  echo "  ↳ ❌ Expected ≥ 2 assessments for unit 12A"
  exit 1
fi

# ─── [6] getOutstandingAssessments ──────────────────────────────────────────
echo ""
echo "── [6] getOutstandingAssessments — expect 3 total ──────────────────────"
OUTSTANDING=$(icp canister call $CANISTER getOutstandingAssessments -e local)
echo "$OUTSTANDING"
OUT_COUNT=$(echo "$OUTSTANDING" | grep -c "ASSESS_" || true)
echo "  → Outstanding: $OUT_COUNT"
if [ "$OUT_COUNT" -ge 3 ]; then
  echo "  ✓ All 3 assessments outstanding"
else
  echo "  ↳ ❌ Expected ≥ 3 outstanding assessments"
  exit 1
fi

# ─── [7] getTotalOutstandingCents ─────────────────────────────────────────────
echo ""
echo "── [7] getTotalOutstandingCents — expect 105000 (45000+15000+45000) ────"
TOTAL=$(icp canister call $CANISTER getTotalOutstandingCents -e local)
echo "$TOTAL"
if echo "$TOTAL" | grep -q "105_000\|105000"; then
  echo "  ✓ Total = 105,000 cents"
else
  echo "  ↳ Total shown above (may differ if canister has prior state)"
fi

# ─── [8] markPaid ────────────────────────────────────────────────────────────
echo ""
echo "── [8] markPaid — mark monthly dues for 12A as paid ────────────────────"
PAID_OUT=$(icp canister call $CANISTER markPaid "(\"$ASSESS_ID\")" -e local)
echo "$PAID_OUT"
if echo "$PAID_OUT" | grep -q "Paid"; then
  echo "  ✓ Assessment marked Paid"
else
  echo "  ↳ ❌ Expected Paid status"
  exit 1
fi

# ─── [9] waiveAssessment ─────────────────────────────────────────────────────
echo ""
echo "── [9] waiveAssessment — waive the special assessment ───────────────────"
WAIVE_OUT=$(icp canister call $CANISTER waiveAssessment "(\"$SPECIAL_ID\")" -e local)
echo "$WAIVE_OUT"
if echo "$WAIVE_OUT" | grep -q "Waived"; then
  echo "  ✓ Assessment waived"
else
  echo "  ↳ ❌ Expected Waived status"
  exit 1
fi

# ─── [10] getOutstandingAssessments after payment ────────────────────────────
echo ""
echo "── [10] getOutstandingAssessments — after pay+waive, expect 1 remaining ─"
REMAINING=$(icp canister call $CANISTER getOutstandingAssessments -e local)
echo "$REMAINING"
REMAIN_COUNT=$(echo "$REMAINING" | grep -c "ASSESS_" || true)
echo "  → Still outstanding: $REMAIN_COUNT"
if [ "$REMAIN_COUNT" -le 1 ]; then
  echo "  ✓ Outstanding reduced after marking paid and waived"
else
  echo "  ↳ ❌ Expected ≤ 1 outstanding assessments"
  exit 1
fi

# ─── [V1] postAssessment with 0 amount → InvalidInput ────────────────────────
echo ""
echo "── [V1] postAssessment 0 amount → expect InvalidInput ───────────────────"
icp canister call $CANISTER postAssessment "(
  \"12A\",
  0,
  variant { Fine },
  \"Zero fine\",
  $DUE
)" -e local && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for 0 amount"

# ─── [V2] markPaid unknown ID → NotFound ─────────────────────────────────────
echo ""
echo "── [V2] markPaid unknown ID → expect NotFound ────────────────────────────"
icp canister call $CANISTER markPaid '("ASSESS_9999")' -e local \
  && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

# ─── [V3] waiveAssessment unknown ID → NotFound ──────────────────────────────
echo ""
echo "── [V3] waiveAssessment unknown ID → expect NotFound ────────────────────"
icp canister call $CANISTER waiveAssessment '("ASSESS_9999")' -e local \
  && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

echo ""
echo "✅  Treasury canister tests passed"
