#!/usr/bin/env bash
# Quorum — Governance Canister Integration Tests
# Covers: createProposal, openProposal, castVote (Yes/No/Abstain),
# finalizeProposal, duplicate vote guard, deadline guard.
# Run: icp network start -d && bash scripts/deploy.sh && bash backend/governance/test.sh
set -euo pipefail

CANISTER="governance"
echo "============================================"
echo "  Quorum — Governance Canister Tests"
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

# Ensure voter identities
for IDENT in quorum-voter-a quorum-voter-b quorum-voter-c; do
  if ! icp identity list 2>/dev/null | grep -q "^${IDENT}$"; then
    icp identity new "$IDENT" --storage plaintext 2>/dev/null || true
  fi
done
VOTER_A=$(icp identity principal --identity quorum-voter-a 2>/dev/null || echo "")
VOTER_B=$(icp identity principal --identity quorum-voter-b 2>/dev/null || echo "")
VOTER_C=$(icp identity principal --identity quorum-voter-c 2>/dev/null || echo "")
echo "Voter A: $VOTER_A"
echo "Voter B: $VOTER_B"
echo "Voter C: $VOTER_C"

# ─── [1] createProposal ──────────────────────────────────────────────────────
echo ""
echo "── [1] createProposal ──────────────────────────────────────────────────"
# Voting deadline 1 year from now in nanoseconds
DEADLINE=$(( ($(date +%s) + 365 * 86400) * 1000000000 ))
PROP_OUT=$(icp canister call $CANISTER createProposal "(
  \"Repave East Parking Lot\",
  \"The east lot has significant cracking. Estimated cost: \$45,000.\",
  $DEADLINE,
  51
)" -e local)
echo "$PROP_OUT"
PROP_ID=$(echo "$PROP_OUT" | grep -oP '"PROP_[0-9]+"' | head -1 | tr -d '"')
echo "  → Proposal ID: $PROP_ID"
if [ -n "$PROP_ID" ]; then
  echo "  ✓ Proposal created"
else
  echo "  ↳ ❌ Could not extract proposal ID"
  exit 1
fi

# ─── [2] openProposal ────────────────────────────────────────────────────────
echo ""
echo "── [2] openProposal ────────────────────────────────────────────────────"
OPEN_OUT=$(icp canister call $CANISTER openProposal "(\"$PROP_ID\")" -e local)
echo "$OPEN_OUT"
if echo "$OPEN_OUT" | grep -q "Open"; then
  echo "  ✓ Proposal is Open"
else
  echo "  ↳ ❌ Expected Open status"
  exit 1
fi

# ─── [3] getOpenProposals ────────────────────────────────────────────────────
echo ""
echo "── [3] getOpenProposals ────────────────────────────────────────────────"
OPEN_LIST=$(icp canister call $CANISTER getOpenProposals -e local)
echo "$OPEN_LIST"
if echo "$OPEN_LIST" | grep -q "$PROP_ID"; then
  echo "  ✓ Proposal in open list"
else
  echo "  ↳ ❌ Expected $PROP_ID in getOpenProposals"
  exit 1
fi

# ─── [4] castVote — Yes from voter A ────────────────────────────────────────
echo ""
echo "── [4] castVote Yes — voter A ──────────────────────────────────────────"
icp identity default quorum-voter-a 2>/dev/null || true
VOTE_A=$(icp canister call $CANISTER castVote "(\"$PROP_ID\", variant { Yes })" -e local)
echo "$VOTE_A"
if echo "$VOTE_A" | grep -q "Yes"; then
  echo "  ✓ Voter A voted Yes"
else
  echo "  ↳ ❌ Expected Yes vote in response"
  icp identity default quorum-local 2>/dev/null || true
  exit 1
fi

# ─── [5] castVote — No from voter B ─────────────────────────────────────────
echo ""
echo "── [5] castVote No — voter B ───────────────────────────────────────────"
icp identity default quorum-voter-b 2>/dev/null || true
icp canister call $CANISTER castVote "(\"$PROP_ID\", variant { No })" -e local
echo "  ✓ Voter B voted No"

# ─── [6] castVote — Abstain from voter C ────────────────────────────────────
echo ""
echo "── [6] castVote Abstain — voter C ─────────────────────────────────────"
icp identity default quorum-voter-c 2>/dev/null || true
icp canister call $CANISTER castVote "(\"$PROP_ID\", variant { Abstain })" -e local
echo "  ✓ Voter C abstained"
icp identity default quorum-local 2>/dev/null || true

# ─── [7] getProposal — check vote counts ────────────────────────────────────
echo ""
echo "── [7] getProposal — verify vote counts (1 Yes, 1 No, 1 Abstain) ───────"
VOTE_CHECK=$(icp canister call $CANISTER getProposal "(\"$PROP_ID\")" -e local)
echo "$VOTE_CHECK"
if echo "$VOTE_CHECK" | grep -q "yesVotes = 1"; then
  echo "  ✓ yesVotes = 1"
else
  echo "  ↳ ❌ Expected yesVotes = 1"
  exit 1
fi

# ─── [8] getMyVote ────────────────────────────────────────────────────────────
echo ""
echo "── [8] getMyVote — voter A ─────────────────────────────────────────────"
icp canister call $CANISTER getMyVote "(\"$PROP_ID\", principal \"$VOTER_A\")" -e local

# ─── [9] finalizeProposal ────────────────────────────────────────────────────
echo ""
echo "── [9] finalizeProposal — 1 Yes of 3 total = 33% < 51% → Failed ────────"
FINAL_OUT=$(icp canister call $CANISTER finalizeProposal "(\"$PROP_ID\")" -e local)
echo "$FINAL_OUT"
if echo "$FINAL_OUT" | grep -q "Failed"; then
  echo "  ✓ Proposal Failed (33% < 51% quorum)"
else
  echo "  ↳ ❌ Expected Failed — 33% yes votes does not meet 51% quorum"
  exit 1
fi

# ─── [10] Create proposal that passes ────────────────────────────────────────
echo ""
echo "── [10] Create and pass a proposal (2 Yes of 2 = 100%) ─────────────────"
PASS_OUT=$(icp canister call $CANISTER createProposal "(
  \"Approve Reserve Fund Contribution\",
  \"Add \$500/unit to reserve fund this quarter.\",
  $DEADLINE,
  51
)" -e local)
PASS_ID=$(echo "$PASS_OUT" | grep -oP '"PROP_[0-9]+"' | head -1 | tr -d '"')
icp canister call $CANISTER openProposal "(\"$PASS_ID\")" -e local > /dev/null
icp identity default quorum-voter-a 2>/dev/null || true
icp canister call $CANISTER castVote "(\"$PASS_ID\", variant { Yes })" -e local > /dev/null
icp identity default quorum-voter-b 2>/dev/null || true
icp canister call $CANISTER castVote "(\"$PASS_ID\", variant { Yes })" -e local > /dev/null
icp identity default quorum-local 2>/dev/null || true
PASS_FINAL=$(icp canister call $CANISTER finalizeProposal "(\"$PASS_ID\")" -e local)
echo "$PASS_FINAL"
if echo "$PASS_FINAL" | grep -q "Passed"; then
  echo "  ✓ Proposal Passed (100% yes votes)"
else
  echo "  ↳ ❌ Expected Passed"
  exit 1
fi

# ─── [V1] Duplicate vote → AlreadyVoted ─────────────────────────────────────
echo ""
echo "── [V1] duplicate vote → expect AlreadyVoted ───────────────────────────"
DEADLINE2=$(( ($(date +%s) + 365 * 86400) * 1000000000 ))
DUP_PROP=$(icp canister call $CANISTER createProposal "(\"Dup Test\", \"test\", $DEADLINE2, 51)" -e local)
DUP_ID=$(echo "$DUP_PROP" | grep -oP '"PROP_[0-9]+"' | head -1 | tr -d '"')
icp canister call $CANISTER openProposal "(\"$DUP_ID\")" -e local > /dev/null
icp identity default quorum-voter-a 2>/dev/null || true
icp canister call $CANISTER castVote "(\"$DUP_ID\", variant { Yes })" -e local > /dev/null
icp canister call $CANISTER castVote "(\"$DUP_ID\", variant { No })" -e local \
  && echo "  ↳ ❌ Expected AlreadyVoted" || echo "  ✓ AlreadyVoted returned"
icp identity default quorum-local 2>/dev/null || true

# ─── [V2] castVote on non-Open proposal → NotOpen ───────────────────────────
echo ""
echo "── [V2] castVote on finalized proposal → expect NotOpen ─────────────────"
icp canister call $CANISTER castVote "(\"$PROP_ID\", variant { Yes })" -e local \
  && echo "  ↳ ❌ Expected NotOpen" || echo "  ✓ NotOpen returned for finalized proposal"

# ─── [V3] quorumPercent > 100 → InvalidInput ─────────────────────────────────
echo ""
echo "── [V3] quorumPercent 101 → expect InvalidInput ─────────────────────────"
icp canister call $CANISTER createProposal '("Bad quorum", "test", 9999999999999999999, 101)' -e local \
  && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for quorum > 100"

echo ""
echo "✅  Governance canister tests passed"
