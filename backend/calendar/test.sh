#!/usr/bin/env bash
# Quorum — Calendar Canister Integration Tests
# Covers: createEvent, deleteEvent, getEvent, listEvents,
# getUpcomingEvents, http_request (iCal), validation guards.
# Run: dfx start --background && dfx deploy calendar && bash backend/calendar/test.sh
set -euo pipefail

CANISTER="calendar"
echo "============================================"
echo "  Quorum — Calendar Canister Tests"
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

NOW_NS=$(( $(date +%s) * 1000000000 ))
START_NS=$(( NOW_NS + 86400000000000 ))       # +1 day
END_NS=$(( START_NS + 7200000000000 ))         # +2 hours
MONTH_END=$(( NOW_NS + 30 * 86400000000000 )) # +30 days

# ─── [1] createEvent ─────────────────────────────────────────────────────────
echo ""
echo "── [1] createEvent — Board Meeting ─────────────────────────────────────"
CREATE_OUT=$(dfx canister call $CANISTER createEvent "(
  \"Annual Board Meeting\",
  $START_NS,
  $END_NS,
  variant { Meeting },
  variant { All },
  opt \"Clubhouse, Room A\"
)" 2>&1)
echo "$CREATE_OUT"
if echo "$CREATE_OUT" | grep -q "ok"; then
  echo "  ✓ createEvent returned ok"
else
  echo "  ↳ ❌ Expected ok result"
  exit 1
fi
if echo "$CREATE_OUT" | grep -q "CAL_"; then
  echo "  ✓ ID assigned"
else
  echo "  ↳ ❌ Expected CAL_ ID"
  exit 1
fi

CAL_ID=$(echo "$CREATE_OUT" | grep -oE '"CAL_[0-9]+"' | tr -d '"' | head -1)
echo "  → Event ID: $CAL_ID"

# ─── [2] getEvent ────────────────────────────────────────────────────────────
echo ""
echo "── [2] getEvent ─────────────────────────────────────────────────────────"
GET_OUT=$(dfx canister call $CANISTER getEvent "(\"$CAL_ID\")" 2>&1)
echo "$GET_OUT"
if echo "$GET_OUT" | grep -q "Annual Board Meeting"; then
  echo "  ✓ Event retrieved"
else
  echo "  ↳ ❌ Expected event title in response"
  exit 1
fi

NULL_OUT=$(dfx canister call $CANISTER getEvent '"CAL_9999"' 2>&1)
if echo "$NULL_OUT" | grep -q "null"; then
  echo "  ✓ Returns null for unknown ID"
else
  echo "  ↳ ❌ Expected null for unknown event"
  exit 1
fi

# ─── [3] listEvents ──────────────────────────────────────────────────────────
echo ""
echo "── [3] listEvents ───────────────────────────────────────────────────────"
LIST_OUT=$(dfx canister call $CANISTER listEvents "(
  $NOW_NS,
  $MONTH_END
)" 2>&1)
echo "$LIST_OUT"
if echo "$LIST_OUT" | grep -q "Annual Board Meeting"; then
  echo "  ✓ Event in date range"
else
  echo "  ↳ ❌ Expected event in listEvents"
  exit 1
fi

EMPTY_OUT=$(dfx canister call $CANISTER listEvents "(
  0,
  1
)" 2>&1)
if echo "$EMPTY_OUT" | grep -q "vec {}"; then
  echo "  ✓ Empty range returns vec {}"
else
  echo "  ↳ ❌ Expected vec {} for empty range"
  exit 1
fi

# ─── [4] getUpcomingEvents ───────────────────────────────────────────────────
echo ""
echo "── [4] getUpcomingEvents ────────────────────────────────────────────────"
UPCOMING_OUT=$(dfx canister call $CANISTER getUpcomingEvents '(10)' 2>&1)
echo "$UPCOMING_OUT"
if echo "$UPCOMING_OUT" | grep -q "Annual Board Meeting"; then
  echo "  ✓ Event appears in upcoming list"
else
  echo "  ↳ ❌ Expected event in getUpcomingEvents"
  exit 1
fi

# ─── [5] Create additional event types ───────────────────────────────────────
echo ""
echo "── [5] Create CommunityEvent and MaintenanceWindow ──────────────────────"
MAINT_NS=$(( NOW_NS + 3 * 86400000000000 ))
MAINT_END=$(( MAINT_NS + 86400000000000 ))

dfx canister call $CANISTER createEvent "(
  \"Pool maintenance\",
  $MAINT_NS,
  $MAINT_END,
  variant { MaintenanceWindow },
  variant { All },
  opt \"Community pool\"
)" > /dev/null
echo "  ✓ MaintenanceWindow event created"

dfx canister call $CANISTER createEvent "(
  \"Summer BBQ\",
  $MAINT_NS,
  $MAINT_END,
  variant { CommunityEvent },
  variant { All },
  opt \"Courtyard\"
)" > /dev/null
echo "  ✓ CommunityEvent created"

# ─── [6] http_request — iCal feed ────────────────────────────────────────────
echo ""
echo "── [6] http_request — iCal feed ─────────────────────────────────────────"
ICAL_OUT=$(dfx canister call $CANISTER http_request '(
  record {
    method = "GET";
    url = "/community.ics";
    headers = vec {};
    body = vec {}
  }
)' 2>&1)
echo "$ICAL_OUT" | head -20
if echo "$ICAL_OUT" | grep -q "200"; then
  echo "  ✓ iCal endpoint returns 200"
else
  echo "  ↳ ❌ Expected 200 status"
  exit 1
fi
if echo "$ICAL_OUT" | grep -q "VCALENDAR\|text/calendar\|BEGIN"; then
  echo "  ✓ Response contains iCal content"
else
  echo "  ↳ ❌ Expected iCal content in response"
  exit 1
fi

# ─── [7] deleteEvent ─────────────────────────────────────────────────────────
echo ""
echo "── [7] deleteEvent ──────────────────────────────────────────────────────"
DEL_OUT=$(dfx canister call $CANISTER deleteEvent "(\"$CAL_ID\")" 2>&1)
echo "$DEL_OUT"
if echo "$DEL_OUT" | grep -q "ok"; then
  echo "  ✓ Event deleted"
else
  echo "  ↳ ❌ Expected ok from deleteEvent"
  exit 1
fi

GONE_OUT=$(dfx canister call $CANISTER getEvent "(\"$CAL_ID\")" 2>&1)
if echo "$GONE_OUT" | grep -q "null"; then
  echo "  ✓ Deleted event returns null"
else
  echo "  ↳ ❌ Expected null after deletion"
  exit 1
fi

# ─── [V1] createEvent empty title → InvalidInput ─────────────────────────────
echo ""
echo "── [V1] empty title → expect InvalidInput ───────────────────────────────"
dfx canister call $CANISTER createEvent "(
  \"\",
  $START_NS,
  $END_NS,
  variant { Meeting },
  variant { All },
  null
)" && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned"

# ─── [V2] endAt <= startAt → InvalidInput ────────────────────────────────────
echo ""
echo "── [V2] endAt before startAt → expect InvalidInput ─────────────────────"
dfx canister call $CANISTER createEvent "(
  \"Bad event\",
  $END_NS,
  $START_NS,
  variant { Meeting },
  variant { All },
  null
)" && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned"

# ─── [V3] deleteEvent unknown → NotFound ─────────────────────────────────────
echo ""
echo "── [V3] deleteEvent unknown → expect NotFound ───────────────────────────"
dfx canister call $CANISTER deleteEvent '"CAL_9999"' \
  && echo "  ↳ ❌ Expected NotFound" || echo "  ✓ NotFound returned"

echo ""
echo "✅  Calendar canister tests passed"
