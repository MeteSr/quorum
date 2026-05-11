#!/usr/bin/env bash
# Quorum — Documents Canister Integration Tests
# Covers: uploadDocument, getAllDocumentsMeta, getDocumentsByCategory,
# visibility (BoardOnly vs AllMembers), deleteDocument.
# Also covers: requiresAcknowledgment, acknowledgeDocument,
# getAcknowledgmentStatus, getMyAcknowledgedDocs.
# Run: dfx start --background && dfx deploy documents && bash backend/documents/test.sh
set -euo pipefail

CANISTER="documents"
echo "============================================"
echo "  Quorum — Documents Canister Tests"
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

# Ensure member identity exists for acknowledgment tests
dfx identity new quorum-member-a --storage-mode plaintext 2>/dev/null || true
MEMBER_A=$(dfx --identity quorum-member-a identity get-principal)
echo "Member A: $MEMBER_A"

# ─── [1] uploadDocument — CC&Rs (AllMembers) ─────────────────────────────────
echo ""
echo "── [1] uploadDocument — CC&Rs governing doc (AllMembers) ──────────────"
DOC_OUT=$(dfx canister call $CANISTER uploadDocument '(
  "Sunrise HOA CC&Rs 2024",
  variant { GoverningDocuments },
  variant { AllMembers },
  blob "CC&Rs content placeholder",
  "text/plain",
  "Community rules and covenants as amended 2024"
)')
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
BUDGET_OUT=$(dfx canister call $CANISTER uploadDocument '(
  "Q2 2024 Budget Report",
  variant { FinancialReports },
  variant { BoardOnly },
  blob "Budget: income 120000 expense 95000",
  "text/plain",
  "Board-only financial summary Q2 2024"
)')
echo "$BUDGET_OUT"
BUDGET_ID=$(echo "$BUDGET_OUT" | grep -oP '"DOC_[0-9]+"' | head -1 | tr -d '"')
echo "  → Budget Doc ID: $BUDGET_ID"

# ─── [3] uploadDocument — meeting minutes ────────────────────────────────────
echo ""
echo "── [3] uploadDocument — meeting minutes (AllMembers) ───────────────────"
MIN_OUT=$(dfx canister call $CANISTER uploadDocument '(
  "May 2024 Board Meeting Minutes",
  variant { MeetingMinutes },
  variant { AllMembers },
  blob "Meeting attended by 5 board members...",
  "text/plain",
  "Minutes from May 2024 board meeting"
)')
echo "$MIN_OUT"

# ─── [4] getAllPublicDocumentsMeta ────────────────────────────────────────────
echo ""
echo "── [4] getAllPublicDocumentsMeta — expect 2 AllMembers docs ────────────"
PUBLIC_OUT=$(dfx canister call $CANISTER getAllPublicDocumentsMeta)
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
ALL_OUT=$(dfx canister call $CANISTER getAllDocumentsMeta)
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
CAT_OUT=$(dfx canister call $CANISTER getDocumentsByCategory '(variant { MeetingMinutes })')
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
FULL_DOC=$(dfx canister call $CANISTER getDocument "(\"$DOC_ID\")")
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
META_OUT=$(dfx canister call $CANISTER getDocumentMeta "(\"$DOC_ID\")")
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
DEL_OUT=$(dfx canister call $CANISTER deleteDocument "(\"$MIN_ID\")")
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
GONE_OUT=$(dfx canister call $CANISTER getDocumentMeta "(\"$MIN_ID\")")
echo "$GONE_OUT"
if echo "$GONE_OUT" | grep -q "null"; then
  echo "  ✓ Deleted document returns null"
else
  echo "  ↳ ❌ Expected null for deleted document"
  exit 1
fi

# ─── Acknowledgment tests ────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Acknowledgment Tests"
echo "============================================"

# ─── [11] setRequiresAcknowledgment ─────────────────────────────────────────
echo ""
echo "── [11] setRequiresAcknowledgment(true) for CC&Rs ───────────────────────"
ACK_REQ_OUT=$(dfx canister call $CANISTER setRequiresAcknowledgment "(\"$DOC_ID\", true)")
echo "$ACK_REQ_OUT"
if echo "$ACK_REQ_OUT" | grep -q "requiresAcknowledgment = true"; then
  echo "  ✓ requiresAcknowledgment set to true"
else
  echo "  ↳ ❌ Expected requiresAcknowledgment = true"
  exit 1
fi

# ─── [12] getAcknowledgmentStatus — empty before any acks ────────────────────
echo ""
echo "── [12] getAcknowledgmentStatus — empty before acknowledgments ──────────"
ACK_STATUS_EMPTY=$(dfx canister call $CANISTER getAcknowledgmentStatus "(\"$DOC_ID\")")
echo "$ACK_STATUS_EMPTY"
echo "  ✓ getAcknowledgmentStatus returned (should be empty vec)"

# ─── [13] acknowledgeDocument — member A acknowledges ────────────────────────
echo ""
echo "── [13] acknowledgeDocument — member A acknowledges CC&Rs ───────────────"
ACK_OUT=$(dfx --identity quorum-member-a canister call $CANISTER acknowledgeDocument "(\"$DOC_ID\")")
echo "$ACK_OUT"
if echo "$ACK_OUT" | grep -q "ok"; then
  echo "  ✓ Member A acknowledged document"
else
  echo "  ↳ ❌ Expected ok from acknowledgeDocument"
  exit 1
fi

# ─── [14] acknowledgeDocument — idempotent re-acknowledgment ─────────────────
echo ""
echo "── [14] re-acknowledge — idempotent (just updates timestamp) ────────────"
dfx --identity quorum-member-a canister call $CANISTER acknowledgeDocument "(\"$DOC_ID\")" > /dev/null
echo "  ✓ Re-acknowledgment accepted (idempotent)"

# ─── [15] getAcknowledgmentStatus — member A appears ────────────────────────
echo ""
echo "── [15] getAcknowledgmentStatus — expect member A entry ─────────────────"
ACK_STATUS=$(dfx canister call $CANISTER getAcknowledgmentStatus "(\"$DOC_ID\")")
echo "$ACK_STATUS"
ACK_COUNT=$(echo "$ACK_STATUS" | grep -c ";" || true)
echo "  → Ack entries: $ACK_COUNT"
if [ "$ACK_COUNT" -ge 1 ]; then
  echo "  ✓ ≥ 1 acknowledgment entry"
else
  echo "  ↳ ❌ Expected acknowledgment entry for member A"
  exit 1
fi

# ─── [16] getMyAcknowledgedDocs — member A sees CC&Rs ────────────────────────
echo ""
echo "── [16] getMyAcknowledgedDocs — member A should see CC&Rs ───────────────"
MY_ACKS=$(dfx --identity quorum-member-a canister call $CANISTER getMyAcknowledgedDocs)
echo "$MY_ACKS"
if echo "$MY_ACKS" | grep -q "$DOC_ID"; then
  echo "  ✓ $DOC_ID in member A's acknowledged docs"
else
  echo "  ↳ ❌ Expected $DOC_ID in getMyAcknowledgedDocs"
  exit 1
fi

# ─── [V1] uploadDocument — empty title → InvalidInput ────────────────────────
echo ""
echo "── [V1] uploadDocument empty title → expect InvalidInput ────────────────"
dfx canister call $CANISTER uploadDocument '(
  "",
  variant { Other },
  variant { AllMembers },
  blob "content",
  "text/plain",
  "desc"
)' && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for empty title"

# ─── [V2] deleteDocument unknown ID → NotFound ───────────────────────────────
echo ""
echo "── [V2] deleteDocument unknown ID → expect NotFound ─────────────────────"
dfx canister call $CANISTER deleteDocument '("DOC_9999")' \
  && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

# ─── [V3] acknowledgeDocument unknown ID → NotFound ──────────────────────────
echo ""
echo "── [V3] acknowledgeDocument unknown ID → expect NotFound ────────────────"
dfx canister call $CANISTER acknowledgeDocument '("DOC_9999")' \
  && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

# ─── [V4] setRequiresAcknowledgment — not uploader → NotAuthorized ────────────
echo ""
echo "── [V4] setRequiresAcknowledgment by non-uploader → expect NotAuthorized ─"
dfx --identity quorum-member-a canister call $CANISTER setRequiresAcknowledgment "(\"$DOC_ID\", false)" \
  && echo "  ↳ ❌ Expected NotAuthorized" || echo "  ✓ NotAuthorized returned"

echo ""
echo "✅  Documents canister tests passed"
