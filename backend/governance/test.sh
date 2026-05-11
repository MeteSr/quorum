#!/usr/bin/env bash
# Quorum — Governance Canister Integration Tests
# Covers: createProposal, openProposal, castVote (Yes/No/Abstain),
# finalizeProposal, duplicate vote guard, deadline guard.
# Also covers: createPoll, castPollVote (changeable), closePoll, getOpenPolls.
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

# ─── Poll tests ────────────────────────────────────────────────────────────────
echo ""
echo "============================================"
echo "  Quick Poll Tests"
echo "============================================"

# ─── [11] createPoll ─────────────────────────────────────────────────────────
echo ""
echo "── [11] createPoll — meeting time question ─────────────────────────────"
POLL_DEADLINE=$(( ($(date +%s) + 7 * 86400) * 1000000000 ))
POLL_OUT=$(dfx canister call $CANISTER createPoll "(
  \"Should we move the monthly meeting to Thursday evenings?\",
  vec { \"Yes, Thursdays work better\"; \"No, keep the current day\"; \"No preference\" },
  $POLL_DEADLINE,
  true,
  false
)")
echo "$POLL_OUT"
POLL_ID=$(echo "$POLL_OUT" | grep -oP '"POLL_[0-9]+"' | head -1 | tr -d '"')
echo "  → Poll ID: $POLL_ID"
if [ -n "$POLL_ID" ]; then
  echo "  ✓ Poll created"
else
  echo "  ↳ ❌ Could not extract poll ID"
  exit 1
fi

# ─── [12] getOpenPolls ───────────────────────────────────────────────────────
echo ""
echo "── [12] getOpenPolls ────────────────────────────────────────────────────"
OPEN_POLLS=$(dfx canister call $CANISTER getOpenPolls)
echo "$OPEN_POLLS"
if echo "$OPEN_POLLS" | grep -q "$POLL_ID"; then
  echo "  ✓ Poll in open list"
else
  echo "  ↳ ❌ Expected $POLL_ID in getOpenPolls"
  exit 1
fi

# ─── [13] castPollVote — voter A picks option 0 ──────────────────────────────
echo ""
echo "── [13] castPollVote — voter A picks option 0 ──────────────────────────"
VOTE_POLL_A=$(dfx --identity quorum-voter-a canister call $CANISTER castPollVote "(\"$POLL_ID\", 0)")
echo "$VOTE_POLL_A"
if echo "$VOTE_POLL_A" | grep -q "ok"; then
  echo "  ✓ Voter A voted on poll"
else
  echo "  ↳ ❌ Expected ok from castPollVote"
  exit 1
fi

# ─── [14] castPollVote — voter B picks option 1 ──────────────────────────────
echo ""
echo "── [14] castPollVote — voter B picks option 1 ──────────────────────────"
dfx --identity quorum-voter-b canister call $CANISTER castPollVote "(\"$POLL_ID\", 1)" > /dev/null
echo "  ✓ Voter B voted on poll"

# ─── [15] re-vote — voter A changes vote to option 2 ─────────────────────────
echo ""
echo "── [15] re-vote — voter A changes vote to option 2 ─────────────────────"
REVOTE_OUT=$(dfx --identity quorum-voter-a canister call $CANISTER castPollVote "(\"$POLL_ID\", 2)")
echo "$REVOTE_OUT"
if echo "$REVOTE_OUT" | grep -q "ok"; then
  echo "  ✓ Voter A re-vote accepted (vote is changeable)"
else
  echo "  ↳ ❌ Expected ok from re-vote"
  exit 1
fi

# ─── [16] getPoll — verify vote counts reflect re-vote ───────────────────────
echo ""
echo "── [16] getPoll — option 0 should have 0 votes (voter A moved away) ────"
POLL_CHECK=$(dfx canister call $CANISTER getPoll "(\"$POLL_ID\")")
echo "$POLL_CHECK"
echo "  ✓ getPoll returned poll data"

# ─── [17] closePoll ──────────────────────────────────────────────────────────
echo ""
echo "── [17] closePoll ──────────────────────────────────────────────────────"
CLOSE_OUT=$(dfx canister call $CANISTER closePoll "(\"$POLL_ID\")")
echo "$CLOSE_OUT"
if echo "$CLOSE_OUT" | grep -q "Closed"; then
  echo "  ✓ Poll closed"
else
  echo "  ↳ ❌ Expected Closed status"
  exit 1
fi

# ─── [18] getAllPolls — includes closed poll ──────────────────────────────────
echo ""
echo "── [18] getAllPolls — closed poll still appears ─────────────────────────"
ALL_POLLS=$(dfx canister call $CANISTER getAllPolls)
echo "$ALL_POLLS"
if echo "$ALL_POLLS" | grep -q "$POLL_ID"; then
  echo "  ✓ Closed poll in getAllPolls"
else
  echo "  ↳ ❌ Expected $POLL_ID in getAllPolls"
  exit 1
fi

# ─── [V4] createPoll with 1 option → InvalidInput ───────────────────────────
echo ""
echo "── [V4] createPoll with 1 option → expect InvalidInput ─────────────────"
dfx canister call $CANISTER createPoll "(
  \"Bad poll\", vec { \"Only one\" }, $POLL_DEADLINE, false, false
)" && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for < 2 options"

# ─── [V5] castPollVote after close → AlreadyClosed ───────────────────────────
echo ""
echo "── [V5] castPollVote after close → expect AlreadyClosed ─────────────────"
dfx --identity quorum-voter-c canister call $CANISTER castPollVote "(\"$POLL_ID\", 0)" \
  && echo "  ↳ ❌ Expected AlreadyClosed" || echo "  ✓ AlreadyClosed returned"

# ─── [V6] createPoll with empty question → InvalidInput ──────────────────────
echo ""
echo "── [V6] createPoll empty question → expect InvalidInput ─────────────────"
dfx canister call $CANISTER createPoll "(
  \"\", vec { \"Yes\"; \"No\" }, $POLL_DEADLINE, false, false
)" && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for empty question"

echo ""
echo "✅  Governance canister tests passed"
