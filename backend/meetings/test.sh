#!/usr/bin/env bash
# Quorum — Meetings Canister Integration Tests
# Covers: createMeeting, addAgendaItem, recordAttendance, addMotion,
# generateMinutes, queries, and input validation guards.
# Run: dfx start --background && dfx deploy meetings && bash backend/meetings/test.sh
set -euo pipefail

CANISTER="meetings"
echo "============================================"
echo "  Quorum — Meetings Canister Tests"
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

# Timestamp ~1 year from now (nanoseconds)
FUTURE_NS=$(( ($(date +%s) + 365 * 86400) * 1000000000 ))

# ─── [1] createMeeting ───────────────────────────────────────────────────────
echo ""
echo "── [1] createMeeting — Board meeting ───────────────────────────────────"
CREATE_OUT=$(dfx canister call $CANISTER createMeeting "(
  $FUTURE_NS,
  variant { Board },
  vec { \"Approve previous minutes\"; \"Financial report\" }
)" 2>&1)
echo "$CREATE_OUT"
if echo "$CREATE_OUT" | grep -q "ok"; then
  echo "  ✓ createMeeting returned ok"
else
  echo "  ↳ ❌ Expected ok result"
  exit 1
fi
if echo "$CREATE_OUT" | grep -q "MTG_"; then
  echo "  ✓ ID assigned"
else
  echo "  ↳ ❌ Expected MTG_ ID"
  exit 1
fi

MTG_ID=$(echo "$CREATE_OUT" | grep -oE '"MTG_[0-9]+"' | tr -d '"' | head -1)
echo "  → Meeting ID: $MTG_ID"
if [ -z "$MTG_ID" ]; then
  echo "  ↳ ❌ Could not extract meeting ID"
  exit 1
fi

# ─── [2] getMeeting ──────────────────────────────────────────────────────────
echo ""
echo "── [2] getMeeting ───────────────────────────────────────────────────────"
GET_OUT=$(dfx canister call $CANISTER getMeeting "(\"$MTG_ID\")" 2>&1)
echo "$GET_OUT"
if echo "$GET_OUT" | grep -q "Board"; then
  echo "  ✓ Meeting retrieved"
else
  echo "  ↳ ❌ Expected Board in getMeeting response"
  exit 1
fi

NULL_OUT=$(dfx canister call $CANISTER getMeeting '"MTG_9999"' 2>&1)
if echo "$NULL_OUT" | grep -q "null"; then
  echo "  ✓ Returns null for unknown ID"
else
  echo "  ↳ ❌ Expected null for unknown meeting"
  exit 1
fi

# ─── [3] getAllMeetings ───────────────────────────────────────────────────────
echo ""
echo "── [3] getAllMeetings ────────────────────────────────────────────────────"
ALL_OUT=$(dfx canister call $CANISTER getAllMeetings 2>&1)
echo "$ALL_OUT"
if echo "$ALL_OUT" | grep -q "MTG_"; then
  echo "  ✓ getAllMeetings returns meetings"
else
  echo "  ↳ ❌ Expected meetings in getAllMeetings"
  exit 1
fi

# ─── [4] addAgendaItem ───────────────────────────────────────────────────────
echo ""
echo "── [4] addAgendaItem ────────────────────────────────────────────────────"
ITEM_OUT=$(dfx canister call $CANISTER addAgendaItem "(
  \"$MTG_ID\",
  \"Reserve fund review\",
  opt \"Treasurer\",
  opt 15
)" 2>&1)
echo "$ITEM_OUT"
if echo "$ITEM_OUT" | grep -q "Reserve fund review"; then
  echo "  ✓ Agenda item added"
else
  echo "  ↳ ❌ Expected agenda item in response"
  exit 1
fi

AGI_ID=$(echo "$ITEM_OUT" | grep -oE '"AGI_[0-9]+"' | tr -d '"' | head -1)
echo "  → Agenda item ID: $AGI_ID"

# ─── [5] recordAttendance ────────────────────────────────────────────────────
echo ""
echo "── [5] recordAttendance ────────────────────────────────────────────────"
MY_PRINCIPAL=$(dfx identity get-principal)
ATT_OUT=$(dfx canister call $CANISTER recordAttendance "(
  \"$MTG_ID\",
  vec { principal \"$MY_PRINCIPAL\" }
)" 2>&1)
echo "$ATT_OUT"
if echo "$ATT_OUT" | grep -q "true"; then
  echo "  ✓ Attendance recorded, quorum met"
else
  echo "  ↳ ❌ Expected quorumMet = true"
  exit 1
fi

# ─── [6] addMotion ───────────────────────────────────────────────────────────
echo ""
echo "── [6] addMotion ────────────────────────────────────────────────────────"
if [ -z "$AGI_ID" ]; then
  AGI_ID=$(echo "$ITEM_OUT" | grep -oE '"AGI_[0-9]+"' | tr -d '"' | head -1)
fi
MOT_OUT=$(dfx canister call $CANISTER addMotion "(
  \"$MTG_ID\",
  \"$AGI_ID\",
  \"Approve \$5,000 reserve fund contribution\",
  \"Alice Board\",
  \"Bob Board\",
  variant { Passed },
  record { forVotes = 4; againstVotes = 1; abstainVotes = 0 }
)" 2>&1)
echo "$MOT_OUT"
if echo "$MOT_OUT" | grep -q "Passed"; then
  echo "  ✓ Motion recorded with Passed outcome"
else
  echo "  ↳ ❌ Expected Passed in motion response"
  exit 1
fi

# ─── [7] generateMinutes ─────────────────────────────────────────────────────
echo ""
echo "── [7] generateMinutes ──────────────────────────────────────────────────"
MIN_OUT=$(dfx canister call $CANISTER generateMinutes "(\"$MTG_ID\")" 2>&1)
echo "$MIN_OUT"
if echo "$MIN_OUT" | grep -q "MINUTES OF Board Meeting"; then
  echo "  ✓ Minutes contain header"
else
  echo "  ↳ ❌ Expected minutes header"
  exit 1
fi
if echo "$MIN_OUT" | grep -q "PASSED"; then
  echo "  ✓ Minutes include motion outcome"
else
  echo "  ↳ ❌ Expected PASSED in minutes"
  exit 1
fi

# ─── [V1] createMeeting with invalid date → InvalidInput ─────────────────────
echo ""
echo "── [V1] createMeeting invalid date → expect InvalidInput ────────────────"
dfx canister call $CANISTER createMeeting '(
  0,
  variant { Board },
  vec {}
)' && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned"

# ─── [V2] addAgendaItem empty title → InvalidInput ───────────────────────────
echo ""
echo "── [V2] addAgendaItem empty title → expect InvalidInput ─────────────────"
dfx canister call $CANISTER addAgendaItem "(
  \"$MTG_ID\",
  \"\",
  null,
  null
)" && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned"

# ─── [V3] addAgendaItem unknown meeting → NotFound ───────────────────────────
echo ""
echo "── [V3] addAgendaItem unknown meeting → expect NotFound ──────────────────"
dfx canister call $CANISTER addAgendaItem '(
  "MTG_9999",
  "Any item",
  null,
  null
)' && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

# ─── [V4] addMotion empty text → InvalidInput ────────────────────────────────
echo ""
echo "── [V4] addMotion empty text → expect InvalidInput ─────────────────────"
dfx canister call $CANISTER addMotion "(
  \"$MTG_ID\",
  \"$AGI_ID\",
  \"\",
  \"A\", \"B\",
  variant { Passed },
  record { forVotes = 1; againstVotes = 0; abstainVotes = 0 }
)" && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned"

# ─── [V5] generateMinutes unknown meeting → NotFound ─────────────────────────
echo ""
echo "── [V5] generateMinutes unknown meeting → expect NotFound ───────────────"
dfx canister call $CANISTER generateMinutes '"MTG_9999"' \
  && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

echo ""
echo "✅  Meetings canister tests passed"
