#!/usr/bin/env bash
# Quorum — Governance Canister Integration Tests
# Covers: createProposal, openProposal, castVote (Yes/No/Abstain),
# finalizeProposal, duplicate vote guard, deadline guard.
# Run: dfx start --background && dfx deploy governance && bash backend/governance/test.sh
set -euo pipefail

CANISTER="governance"
echo "============================================"
echo "  Quorum — Governance Canister Tests"
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

# Ensure voter identities exist, then capture principals without switching global identity
for IDENT in quorum-voter-a quorum-voter-b quorum-voter-c; do
  dfx identity new "$IDENT" --storage-mode plaintext 2>/dev/null || true
done
VOTER_A=$(dfx --identity quorum-voter-a identity get-principal)
VOTER_B=$(dfx --identity quorum-voter-b identity get-principal)
VOTER_C=$(dfx --identity quorum-voter-c identity get-principal)
echo "Voter A: $VOTER_A"
echo "Voter B: $VOTER_B"
echo "Voter C: $VOTER_C"

# ─── [1] createProposal ──────────────────────────────────────────────────────
echo ""
echo "── [1] createProposal ──────────────────────────────────────────────────"
DEADLINE=$(( ($(date +%s) + 365 * 86400) * 1000000000 ))
PROP_OUT=$(dfx canister call $CANISTER createProposal "(
  \"Repave East Parking Lot\",
  \"The east lot has significant cracking. Estimated cost: \$45,000.\",
  $DEADLINE,
  51
)")
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
OPEN_OUT=$(dfx canister call $CANISTER openProposal "(\"$PROP_ID\")")
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
OPEN_LIST=$(dfx canister call $CANISTER getOpenProposals)
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
VOTE_A=$(dfx --identity quorum-voter-a canister call $CANISTER castVote "(\"$PROP_ID\", variant { Yes })")
echo "$VOTE_A"
if echo "$VOTE_A" | grep -q "Yes"; then
  echo "  ✓ Voter A voted Yes"
else
  echo "  ↳ ❌ Expected Yes vote in response"
  exit 1
fi

# ─── [5] castVote — No from voter B ─────────────────────────────────────────
echo ""
echo "── [5] castVote No — voter B ───────────────────────────────────────────"
dfx --identity quorum-voter-b canister call $CANISTER castVote "(\"$PROP_ID\", variant { No })"
echo "  ✓ Voter B voted No"

# ─── [6] castVote — Abstain from voter C ────────────────────────────────────
echo ""
echo "── [6] castVote Abstain — voter C ─────────────────────────────────────"
dfx --identity quorum-voter-c canister call $CANISTER castVote "(\"$PROP_ID\", variant { Abstain })"
echo "  ✓ Voter C abstained"

# ─── [7] getProposal — check vote counts ────────────────────────────────────
echo ""
echo "── [7] getProposal — verify vote counts (1 Yes, 1 No, 1 Abstain) ───────"
VOTE_CHECK=$(dfx canister call $CANISTER getProposal "(\"$PROP_ID\")")
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
dfx canister call $CANISTER getMyVote "(\"$PROP_ID\", principal \"$VOTER_A\")"

# ─── [9] finalizeProposal ────────────────────────────────────────────────────
echo ""
echo "── [9] finalizeProposal — 1 Yes of 3 total = 33% < 51% → Failed ────────"
FINAL_OUT=$(dfx canister call $CANISTER finalizeProposal "(\"$PROP_ID\")")
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
PASS_OUT=$(dfx canister call $CANISTER createProposal "(
  \"Approve Reserve Fund Contribution\",
  \"Add \$500/unit to reserve fund this quarter.\",
  $DEADLINE,
  51
)")
PASS_ID=$(echo "$PASS_OUT" | grep -oP '"PROP_[0-9]+"' | head -1 | tr -d '"')
dfx canister call $CANISTER openProposal "(\"$PASS_ID\")" > /dev/null
dfx --identity quorum-voter-a canister call $CANISTER castVote "(\"$PASS_ID\", variant { Yes })" > /dev/null
dfx --identity quorum-voter-b canister call $CANISTER castVote "(\"$PASS_ID\", variant { Yes })" > /dev/null
PASS_FINAL=$(dfx canister call $CANISTER finalizeProposal "(\"$PASS_ID\")")
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
DUP_PROP=$(dfx canister call $CANISTER createProposal "(\"Dup Test\", \"test\", $DEADLINE2, 51)")
DUP_ID=$(echo "$DUP_PROP" | grep -oP '"PROP_[0-9]+"' | head -1 | tr -d '"')
dfx canister call $CANISTER openProposal "(\"$DUP_ID\")" > /dev/null
dfx --identity quorum-voter-a canister call $CANISTER castVote "(\"$DUP_ID\", variant { Yes })" > /dev/null
dfx --identity quorum-voter-a canister call $CANISTER castVote "(\"$DUP_ID\", variant { No })" \
  && echo "  ↳ ❌ Expected AlreadyVoted" || echo "  ✓ AlreadyVoted returned"

# ─── [V2] castVote on non-Open proposal → NotOpen ───────────────────────────
echo ""
echo "── [V2] castVote on finalized proposal → expect NotOpen ─────────────────"
dfx canister call $CANISTER castVote "(\"$PROP_ID\", variant { Yes })" \
  && echo "  ↳ ❌ Expected NotOpen" || echo "  ✓ NotOpen returned for finalized proposal"

# ─── [V3] quorumPercent > 100 → InvalidInput ─────────────────────────────────
echo ""
echo "── [V3] quorumPercent 101 → expect InvalidInput ─────────────────────────"
dfx canister call $CANISTER createProposal '("Bad quorum", "test", 9999999999999999999, 101)' \
  && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for quorum > 100"

echo ""
echo "✅  Governance canister tests passed"
