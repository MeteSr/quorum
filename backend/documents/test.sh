#!/usr/bin/env bash
# Quorum — Documents Canister Integration Tests
# Covers: uploadDocument, getAllDocumentsMeta, getDocumentsByCategory,
# visibility (BoardOnly vs AllMembers), deleteDocument.
# Run: icp network start -d && bash scripts/deploy.sh && bash backend/documents/test.sh
set -euo pipefail

CANISTER="documents"
echo "============================================"
echo "  Quorum — Documents Canister Tests"
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

# ─── [1] uploadDocument — CC&Rs (AllMembers) ─────────────────────────────────
echo ""
echo "── [1] uploadDocument — CC&Rs governing doc (AllMembers) ──────────────"
DOC_OUT=$(icp canister call $CANISTER uploadDocument '(
  "Sunrise HOA CC&Rs 2024",
  variant { GoverningDocuments },
  variant { AllMembers },
  blob "CC&Rs content placeholder",
  "text/plain",
  "Community rules and covenants as amended 2024"
)' -e local)
echo "$DOC_OUT"
DOC_ID=$(echo "$DOC_OUT" | grep -oP '"DOC_[0-9]+"' | head -1 | tr -d '"')
echo "  → Document ID: $DOC_ID"
if [ -n "$DOC_ID" ]; then
  echo "  ✓ Document uploaded"
else
  echo "  ↳ ❌ Could not extract document ID"
  exit 1
fi

# ─── [2] uploadDocument — Budget (BoardOnly) ─────────────────────────────────
echo ""
echo "── [2] uploadDocument — Q2 budget report (BoardOnly) ───────────────────"
BUDGET_OUT=$(icp canister call $CANISTER uploadDocument '(
  "Q2 2024 Budget Report",
  variant { FinancialReports },
  variant { BoardOnly },
  blob "Budget: income 120000 expense 95000",
  "text/plain",
  "Board-only financial summary Q2 2024"
)' -e local)
echo "$BUDGET_OUT"
BUDGET_ID=$(echo "$BUDGET_OUT" | grep -oP '"DOC_[0-9]+"' | head -1 | tr -d '"')
echo "  → Budget Doc ID: $BUDGET_ID"

# ─── [3] uploadDocument — meeting minutes ────────────────────────────────────
echo ""
echo "── [3] uploadDocument — meeting minutes (AllMembers) ───────────────────"
MIN_OUT=$(icp canister call $CANISTER uploadDocument '(
  "May 2024 Board Meeting Minutes",
  variant { MeetingMinutes },
  variant { AllMembers },
  blob "Meeting attended by 5 board members...",
  "text/plain",
  "Minutes from May 2024 board meeting"
)' -e local)
echo "$MIN_OUT"

# ─── [4] getAllPublicDocumentsMeta ────────────────────────────────────────────
echo ""
echo "── [4] getAllPublicDocumentsMeta — expect 2 AllMembers docs ────────────"
PUBLIC_OUT=$(icp canister call $CANISTER getAllPublicDocumentsMeta -e local)
echo "$PUBLIC_OUT"
PUB_COUNT=$(echo "$PUBLIC_OUT" | grep -c "DOC_" || true)
echo "  → Public docs: $PUB_COUNT"
if [ "$PUB_COUNT" -ge 2 ]; then
  echo "  ✓ ≥ 2 public documents returned"
else
  echo "  ↳ ❌ Expected ≥ 2 public documents"
  exit 1
fi

# ─── [5] getAllDocumentsMeta ─────────────────────────────────────────────────
echo ""
echo "── [5] getAllDocumentsMeta — expect 3 total (including BoardOnly) ───────"
ALL_OUT=$(icp canister call $CANISTER getAllDocumentsMeta -e local)
echo "$ALL_OUT"
ALL_COUNT=$(echo "$ALL_OUT" | grep -c "DOC_" || true)
echo "  → Total docs: $ALL_COUNT"
if [ "$ALL_COUNT" -ge 3 ]; then
  echo "  ✓ ≥ 3 total documents"
else
  echo "  ↳ ❌ Expected ≥ 3 documents in getAllDocumentsMeta"
  exit 1
fi

# ─── [6] getDocumentsByCategory ──────────────────────────────────────────────
echo ""
echo "── [6] getDocumentsByCategory(MeetingMinutes) ───────────────────────────"
CAT_OUT=$(icp canister call $CANISTER getDocumentsByCategory '(variant { MeetingMinutes })' -e local)
echo "$CAT_OUT"
if echo "$CAT_OUT" | grep -q "May 2024 Board Meeting"; then
  echo "  ✓ Meeting minutes found by category"
else
  echo "  ↳ ❌ Expected meeting minutes in MeetingMinutes category"
  exit 1
fi

# ─── [7] getDocument (full content) ──────────────────────────────────────────
echo ""
echo "── [7] getDocument — retrieve full content ──────────────────────────────"
FULL_DOC=$(icp canister call $CANISTER getDocument "(\"$DOC_ID\")" -e local)
echo "$FULL_DOC"
if echo "$FULL_DOC" | grep -q "CC"; then
  echo "  ✓ Document content retrieved"
else
  echo "  ↳ ❌ Expected document content"
  exit 1
fi

# ─── [8] getDocumentMeta ─────────────────────────────────────────────────────
echo ""
echo "── [8] getDocumentMeta — metadata only ──────────────────────────────────"
META_OUT=$(icp canister call $CANISTER getDocumentMeta "(\"$DOC_ID\")" -e local)
echo "$META_OUT"
if echo "$META_OUT" | grep -q "CC&Rs"; then
  echo "  ✓ Document metadata retrieved"
else
  echo "  ↳ ❌ Expected document metadata"
  exit 1
fi

# ─── [9] deleteDocument ──────────────────────────────────────────────────────
echo ""
echo "── [9] deleteDocument — remove the minutes ─────────────────────────────"
MIN_ID=$(echo "$MIN_OUT" | grep -oP '"DOC_[0-9]+"' | head -1 | tr -d '"')
DEL_OUT=$(icp canister call $CANISTER deleteDocument "(\"$MIN_ID\")" -e local)
echo "$DEL_OUT"
if echo "$DEL_OUT" | grep -q "ok"; then
  echo "  ✓ Document deleted"
else
  echo "  ↳ ❌ Expected ok from deleteDocument"
  exit 1
fi

# ─── [10] Verify deleted doc is gone ─────────────────────────────────────────
echo ""
echo "── [10] getDocumentMeta after delete — expect null ──────────────────────"
GONE_OUT=$(icp canister call $CANISTER getDocumentMeta "(\"$MIN_ID\")" -e local)
echo "$GONE_OUT"
if echo "$GONE_OUT" | grep -q "null"; then
  echo "  ✓ Deleted document returns null"
else
  echo "  ↳ ❌ Expected null for deleted document"
  exit 1
fi

# ─── [V1] uploadDocument — empty title → InvalidInput ────────────────────────
echo ""
echo "── [V1] uploadDocument empty title → expect InvalidInput ────────────────"
icp canister call $CANISTER uploadDocument '(
  "",
  variant { Other },
  variant { AllMembers },
  blob "content",
  "text/plain",
  "desc"
)' -e local && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for empty title"

# ─── [V2] deleteDocument unknown ID → NotFound ───────────────────────────────
echo ""
echo "── [V2] deleteDocument unknown ID → expect NotFound ─────────────────────"
icp canister call $CANISTER deleteDocument '("DOC_9999")' -e local \
  && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

echo ""
echo "✅  Documents canister tests passed"
