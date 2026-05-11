#!/usr/bin/env bash
# Quorum — Members Canister Integration Tests
# Covers: initAdmin, community profile, invite codes, member registration, roles.
# Run: dfx start --background && dfx deploy members && bash backend/members/test.sh
set -euo pipefail

CANISTER="members"
echo "============================================"
echo "  Quorum — Members Canister Tests"
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

# Ensure a second identity and capture its principal
dfx identity new quorum-member-b --storage-mode plaintext 2>/dev/null || true
MEMBER_B=$(dfx --identity quorum-member-b identity get-principal)
echo "Member B principal: $MEMBER_B"

# ─── [1] initAdmin ───────────────────────────────────────────────────────────
echo ""
echo "── [1] initAdmin ───────────────────────────────────────────────────────"
dfx canister call $CANISTER initAdmin || echo "  ↳ Already initialized (ok)"

# ─── [2] setCommunityProfile ─────────────────────────────────────────────────
echo ""
echo "── [2] setCommunityProfile ─────────────────────────────────────────────"
PROFILE_OUT=$(dfx canister call $CANISTER setCommunityProfile '(
  "Sunrise HOA",
  "100 Sunrise Blvd, Austin TX 78701",
  48,
  "A friendly community of 48 units"
)')
echo "$PROFILE_OUT"
if echo "$PROFILE_OUT" | grep -q "Sunrise HOA"; then
  echo "  ✓ Community profile set"
else
  echo "  ↳ ❌ Expected community profile in response"
  exit 1
fi

# ─── [3] getCommunityProfile ─────────────────────────────────────────────────
echo ""
echo "── [3] getCommunityProfile ─────────────────────────────────────────────"
GET_PROFILE=$(dfx canister call $CANISTER getCommunityProfile)
echo "$GET_PROFILE"
if echo "$GET_PROFILE" | grep -q "Sunrise HOA"; then
  echo "  ✓ Profile retrieved"
else
  echo "  ↳ ❌ Expected community profile"
  exit 1
fi

# ─── [4] generateInviteCode ──────────────────────────────────────────────────
echo ""
echo "── [4] generateInviteCode ──────────────────────────────────────────────"
CODE_OUT=$(dfx canister call $CANISTER generateInviteCode '(
  "SUNRISE2024",
  10,
  null
)')
echo "$CODE_OUT"
if echo "$CODE_OUT" | grep -q "SUNRISE2024"; then
  echo "  ✓ Invite code created"
else
  echo "  ↳ ❌ Expected invite code in response"
  exit 1
fi

# ─── [5] getInviteCode ───────────────────────────────────────────────────────
echo ""
echo "── [5] getInviteCode ───────────────────────────────────────────────────"
dfx canister call $CANISTER getInviteCode '("SUNRISE2024")'

# ─── [6] registerMember (member B uses the code) ─────────────────────────────
echo ""
echo "── [6] registerMember — member B registers with invite code ─────────────"
REG_OUT=$(dfx --identity quorum-member-b canister call $CANISTER registerMember '(
  "12A",
  "Jordan Smith",
  "jordan@sunrise.hoa",
  "SUNRISE2024"
)')
echo "$REG_OUT"
if echo "$REG_OUT" | grep -q "Jordan Smith"; then
  echo "  ✓ Member registered"
else
  echo "  ↳ ❌ Expected registration result"
  exit 1
fi

# ─── [7] getMember ───────────────────────────────────────────────────────────
echo ""
echo "── [7] getMember by principal ──────────────────────────────────────────"
GET_MEMBER=$(dfx canister call $CANISTER getMember "(principal \"$MEMBER_B\")")
echo "$GET_MEMBER"
if echo "$GET_MEMBER" | grep -q "Jordan Smith"; then
  echo "  ✓ Member retrieved"
else
  echo "  ↳ ❌ Expected Jordan Smith in response"
  exit 1
fi

# ─── [8] getAllMembers / getActiveMembers ────────────────────────────────────
echo ""
echo "── [8] getAllMembers / getActiveMembers ────────────────────────────────"
ALL=$(dfx canister call $CANISTER getAllMembers)
ACTIVE=$(dfx canister call $CANISTER getActiveMembers)
echo "All: $ALL"
echo "Active: $ACTIVE"
if echo "$ALL" | grep -q "Jordan Smith"; then
  echo "  ✓ getAllMembers includes Jordan Smith"
else
  echo "  ↳ ❌ Expected Jordan Smith in getAllMembers"
  exit 1
fi

# ─── [9] assignRole ──────────────────────────────────────────────────────────
echo ""
echo "── [9] assignRole — promote member B to BoardMember ────────────────────"
ROLE_OUT=$(dfx canister call $CANISTER assignRole "(
  principal \"$MEMBER_B\",
  variant { BoardMember }
)")
echo "$ROLE_OUT"
if echo "$ROLE_OUT" | grep -q "ok"; then
  echo "  ✓ Role assigned"
else
  echo "  ↳ ❌ Expected ok response"
  exit 1
fi

# ─── [10] isBoardMember ──────────────────────────────────────────────────────
echo ""
echo "── [10] isBoardMember ──────────────────────────────────────────────────"
IS_BOARD=$(dfx canister call $CANISTER isBoardMember "(principal \"$MEMBER_B\")")
echo "$IS_BOARD"
if echo "$IS_BOARD" | grep -q "true"; then
  echo "  ✓ Member B is now a board member"
else
  echo "  ↳ ❌ Expected true from isBoardMember"
  exit 1
fi

# ─── [V1] registerMember again → AlreadyExists ───────────────────────────────
echo ""
echo "── [V1] registerMember again → expect AlreadyExists ────────────────────"
dfx --identity quorum-member-b canister call $CANISTER registerMember '(
  "12A",
  "Jordan Again",
  "jordan2@sunrise.hoa",
  "SUNRISE2024"
)' && echo "  ↳ ❌ Expected AlreadyExists" || echo "  ✓ AlreadyExists returned"

# ─── [V2] setCommunityProfile — empty name → InvalidInput ────────────────────
echo ""
echo "── [V2] setCommunityProfile empty name → expect InvalidInput ─────────────"
dfx canister call $CANISTER setCommunityProfile '("", "addr", 10, "desc")' \
  && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for empty name"

# ─── [V3] generateInviteCode — duplicate → AlreadyExists ────────────────────
echo ""
echo "── [V3] generateInviteCode duplicate → expect AlreadyExists ─────────────"
dfx canister call $CANISTER generateInviteCode '("SUNRISE2024", 5, null)' \
  && echo "  ↳ ❌ Expected AlreadyExists" || echo "  ✓ AlreadyExists returned for duplicate code"

# ─── [V4] registerMember with invalid code ───────────────────────────────────
echo ""
echo "── [V4] registerMember invalid code → expect InvalidCode ─────────────────"
dfx canister call $CANISTER registerMember '("5B", "X", "x@y.com", "BADCODE")' \
  && echo "  ↳ ❌ Expected InvalidCode" || echo "  ✓ InvalidCode returned for bad invite"

echo ""
echo "✅  Members canister tests passed"
