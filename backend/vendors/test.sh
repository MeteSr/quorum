#!/usr/bin/env bash
# Quorum — Vendors Canister Integration Tests
# Covers: addVendor, updateVendor, removeVendor, addVendorReview,
# logJob, getVendorsByCategory, getJobsForVendor,
# updateCOI, getExpiringCOIs.
# Run: dfx start --background && dfx deploy vendors && bash backend/vendors/test.sh
set -euo pipefail

CANISTER="vendors"
echo "============================================"
echo "  Quorum — Vendors Canister Tests"
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

# ─── [1] addVendor — plumber ──────────────────────────────────────────────────
echo ""
echo "── [1] addVendor — ABC Plumbing (Plumbing) ─────────────────────────────"
VND_OUT=$(dfx canister call $CANISTER addVendor '(
  "ABC Plumbing & Drain",
  variant { Plumbing },
  "555-111-2222",
  "abc@plumbing.com",
  "https://abcplumbing.com",
  "Reliable — handled main line repair 2023"
)')
echo "$VND_OUT"
VND_ID=$(echo "$VND_OUT" | grep -oP '"VND_[0-9]+"' | head -1 | tr -d '"')
echo "  → Vendor ID: $VND_ID"
if [ -n "$VND_ID" ]; then
  echo "  ✓ Vendor added"
else
  echo "  ↳ ❌ Could not extract vendor ID"
  exit 1
fi

# ─── [2] addVendor — landscaper ──────────────────────────────────────────────
echo ""
echo "── [2] addVendor — GreenScape Landscaping ──────────────────────────────"
GS_OUT=$(dfx canister call $CANISTER addVendor '(
  "GreenScape Landscaping",
  variant { Landscaping },
  "555-333-4444",
  "info@greenscape.com",
  "",
  "Weekly mow + seasonal clean-up contract"
)')
echo "$GS_OUT"
GS_ID=$(echo "$GS_OUT" | grep -oP '"VND_[0-9]+"' | head -1 | tr -d '"')
echo "  → Vendor ID: $GS_ID"

# ─── [3] getAllVendors ────────────────────────────────────────────────────────
echo ""
echo "── [3] getAllVendors — expect 2 vendors ─────────────────────────────────"
ALL_OUT=$(dfx canister call $CANISTER getAllVendors)
echo "$ALL_OUT"
ALL_COUNT=$(echo "$ALL_OUT" | grep -c "VND_" || true)
echo "  → Total vendors: $ALL_COUNT"
if [ "$ALL_COUNT" -ge 2 ]; then
  echo "  ✓ ≥ 2 vendors returned"
else
  echo "  ↳ ❌ Expected ≥ 2 vendors"
  exit 1
fi

# ─── [4] getVendor ───────────────────────────────────────────────────────────
echo ""
echo "── [4] getVendor — retrieve by ID ──────────────────────────────────────"
GET_OUT=$(dfx canister call $CANISTER getVendor "(\"$VND_ID\")")
echo "$GET_OUT"
if echo "$GET_OUT" | grep -q "ABC Plumbing"; then
  echo "  ✓ Vendor retrieved"
else
  echo "  ↳ ❌ Expected vendor name in output"
  exit 1
fi

# ─── [5] getVendorsByCategory ────────────────────────────────────────────────
echo ""
echo "── [5] getVendorsByCategory(Landscaping) — expect GreenScape ───────────"
CAT_OUT=$(dfx canister call $CANISTER getVendorsByCategory '(variant { Landscaping })')
echo "$CAT_OUT"
if echo "$CAT_OUT" | grep -q "GreenScape"; then
  echo "  ✓ GreenScape found in Landscaping category"
else
  echo "  ↳ ❌ Expected GreenScape in Landscaping results"
  exit 1
fi

# ─── [6] updateVendor ────────────────────────────────────────────────────────
echo ""
echo "── [6] updateVendor — update phone + notes ──────────────────────────────"
UPD_OUT=$(dfx canister call $CANISTER updateVendor "(
  \"$VND_ID\",
  \"ABC Plumbing & Drain\",
  \"555-111-9999\",
  \"abc@plumbing.com\",
  \"https://abcplumbing.com\",
  \"Updated: now offers 24/7 emergency service\"
)")
echo "$UPD_OUT"
if echo "$UPD_OUT" | grep -q "9999"; then
  echo "  ✓ Vendor updated"
else
  echo "  ↳ ❌ Expected updated phone in response"
  exit 1
fi

# ─── [7] addVendorReview ─────────────────────────────────────────────────────
echo ""
echo "── [7] addVendorReview — 4 stars ────────────────────────────────────────"
REV_OUT=$(dfx canister call $CANISTER addVendorReview "(\"$VND_ID\", 4)")
echo "$REV_OUT"
if echo "$REV_OUT" | grep -q "reviewCount = 1"; then
  echo "  ✓ Review added (reviewCount = 1)"
else
  echo "  ↳ ❌ Expected reviewCount = 1"
  exit 1
fi

# ─── [8] addVendorReview — second review ─────────────────────────────────────
echo ""
echo "── [8] addVendorReview — 5 stars (second review) ────────────────────────"
dfx canister call $CANISTER addVendorReview "(\"$VND_ID\", 5)" > /dev/null
echo "  ✓ Second review added"

# ─── [9] logJob ──────────────────────────────────────────────────────────────
echo ""
echo "── [9] logJob — main line repair ────────────────────────────────────────"
JOB_OUT=$(dfx canister call $CANISTER logJob "(
  \"$VND_ID\",
  \"Main sewer line hydro-jet cleaning\",
  null,
  opt (75000 : nat),
  \"Completed without issues\"
)")
echo "$JOB_OUT"
JOB_ID=$(echo "$JOB_OUT" | grep -oP '"JOB_[0-9]+"' | head -1 | tr -d '"')
echo "  → Job ID: $JOB_ID"
if [ -n "$JOB_ID" ]; then
  echo "  ✓ Job logged"
else
  echo "  ↳ ❌ Could not extract job ID"
  exit 1
fi

# ─── [10] getJobsForVendor ───────────────────────────────────────────────────
echo ""
echo "── [10] getJobsForVendor — expect 1 job ────────────────────────────────"
JOBS_OUT=$(dfx canister call $CANISTER getJobsForVendor "(\"$VND_ID\")")
echo "$JOBS_OUT"
if echo "$JOBS_OUT" | grep -q "JOB_"; then
  echo "  ✓ Job found for vendor"
else
  echo "  ↳ ❌ Expected job in getJobsForVendor"
  exit 1
fi

# ─── [11] updateCOI ──────────────────────────────────────────────────────────
echo ""
echo "── [11] updateCOI — set COI expiring in 60 days ────────────────────────"
EXPIRY=$(( ($(date +%s) + 60 * 86400) * 1000000000 ))
COI_OUT=$(dfx canister call $CANISTER updateCOI "(
  \"$VND_ID\",
  null,
  $EXPIRY
)")
echo "$COI_OUT"
if echo "$COI_OUT" | grep -q "expiryNs"; then
  echo "  ✓ COI updated"
else
  echo "  ↳ ❌ Expected expiryNs in COI response"
  exit 1
fi

# ─── [12] getExpiringCOIs — within 90 days ───────────────────────────────────
echo ""
echo "── [12] getExpiringCOIs(90) — should include vendor with 60-day COI ────"
EXP_OUT=$(dfx canister call $CANISTER getExpiringCOIs "(90)")
echo "$EXP_OUT"
if echo "$EXP_OUT" | grep -q "$VND_ID"; then
  echo "  ✓ Vendor with 60-day expiry appears in 90-day window"
else
  echo "  ↳ ❌ Expected $VND_ID in getExpiringCOIs(90)"
  exit 1
fi

# ─── [13] getExpiringCOIs — within 30 days ───────────────────────────────────
echo ""
echo "── [13] getExpiringCOIs(30) — should NOT include 60-day COI ────────────"
EXP30_OUT=$(dfx canister call $CANISTER getExpiringCOIs "(30)")
echo "$EXP30_OUT"
if echo "$EXP30_OUT" | grep -q "$VND_ID"; then
  echo "  ↳ ❌ Vendor with 60-day expiry should NOT appear in 30-day window"
  exit 1
else
  echo "  ✓ Vendor correctly excluded from 30-day window"
fi

# ─── [14] removeVendor ───────────────────────────────────────────────────────
echo ""
echo "── [14] removeVendor — delete GreenScape ────────────────────────────────"
DEL_OUT=$(dfx canister call $CANISTER removeVendor "(\"$GS_ID\")")
echo "$DEL_OUT"
if echo "$DEL_OUT" | grep -q "ok"; then
  echo "  ✓ Vendor removed"
else
  echo "  ↳ ❌ Expected ok from removeVendor"
  exit 1
fi

# ─── [15] getVendor after remove — expect null ───────────────────────────────
echo ""
echo "── [15] getVendor after remove — expect null ────────────────────────────"
GONE_OUT=$(dfx canister call $CANISTER getVendor "(\"$GS_ID\")")
echo "$GONE_OUT"
if echo "$GONE_OUT" | grep -q "null"; then
  echo "  ✓ Removed vendor returns null"
else
  echo "  ↳ ❌ Expected null for removed vendor"
  exit 1
fi

# ─── Validation tests ────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Validation Tests"
echo "============================================"

# ─── [V1] addVendor empty name → InvalidInput ─────────────────────────────────
echo ""
echo "── [V1] addVendor empty name → expect InvalidInput ─────────────────────"
dfx canister call $CANISTER addVendor '(
  "",
  variant { Other },
  "555-000-0000",
  "",
  "",
  ""
)' && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned"

# ─── [V2] addVendorReview stars 0 → InvalidInput ──────────────────────────────
echo ""
echo "── [V2] addVendorReview stars=0 → expect InvalidInput ──────────────────"
dfx canister call $CANISTER addVendorReview "(\"$VND_ID\", 0)" \
  && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for stars=0"

# ─── [V3] addVendorReview stars 6 → InvalidInput ──────────────────────────────
echo ""
echo "── [V3] addVendorReview stars=6 → expect InvalidInput ──────────────────"
dfx canister call $CANISTER addVendorReview "(\"$VND_ID\", 6)" \
  && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for stars=6"

# ─── [V4] getVendor unknown ID → null ────────────────────────────────────────
echo ""
echo "── [V4] getVendor unknown ID → expect null ──────────────────────────────"
NULL_OUT=$(dfx canister call $CANISTER getVendor '("VND_9999")')
if echo "$NULL_OUT" | grep -q "null"; then
  echo "  ✓ null returned for unknown vendor"
else
  echo "  ↳ ❌ Expected null"
  exit 1
fi

# ─── [V5] logJob unknown vendorId → NotFound ──────────────────────────────────
echo ""
echo "── [V5] logJob unknown vendorId → expect NotFound ───────────────────────"
dfx canister call $CANISTER logJob '(
  "VND_9999",
  "test job",
  null,
  null,
  ""
)' && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

echo ""
echo "✅  Vendors canister tests passed"
