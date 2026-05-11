#!/usr/bin/env bash
# Quorum — Members Canister Integration Tests
# Covers: initAdmin, community profile, invite codes, member registration, roles.
# Run: icp network start -d && bash scripts/deploy.sh && bash backend/members/test.sh
set -euo pipefail

CANISTER="members"
echo "============================================"
echo "  Quorum — Members Canister Tests"
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

# Ensure a second identity
if ! icp identity list 2>/dev/null | grep -q "^quorum-member-b$"; then
  icp identity new quorum-member-b --storage plaintext 2>/dev/null || true
fi
MEMBER_B=$(icp identity principal --identity quorum-member-b 2>/dev/null || echo "")
echo "Member B principal: $MEMBER_B"

# ─── [1] initAdmin ───────────────────────────────────────────────────────────
echo ""
echo "── [1] initAdmin ───────────────────────────────────────────────────────"
icp canister call $CANISTER initAdmin -e local || echo "  ↳ Already initialized (ok)"

# ─── [2] setCommunityProfile ─────────────────────────────────────────────────
echo ""
echo "── [2] setCommunityProfile ─────────────────────────────────────────────"
PROFILE_OUT=$(icp canister call $CANISTER setCommunityProfile '(
  "Sunrise HOA",
  "100 Sunrise Blvd, Austin TX 78701",
  48,
  "A friendly community of 48 units"
)' -e local)
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
GET_PROFILE=$(icp canister call $CANISTER getCommunityProfile -e local)
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
CODE_OUT=$(icp canister call $CANISTER generateInviteCode '(
  "SUNRISE2024",
  10,
  null
)' -e local)
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
icp canister call $CANISTER getInviteCode '("SUNRISE2024")' -e local

# ─── [6] registerMember (member B uses the code) ─────────────────────────────
echo ""
echo "── [6] registerMember — member B registers with invite code ─────────────"
icp identity default quorum-member-b 2>/dev/null || true
REG_OUT=$(icp canister call $CANISTER registerMember '(
  "12A",
  "Jordan Smith",
  "jordan@sunrise.hoa",
  "SUNRISE2024"
)' -e local)
echo "$REG_OUT"
if echo "$REG_OUT" | grep -q "Jordan Smith"; then
  echo "  ✓ Member registered"
else
  echo "  ↳ ❌ Expected registration result"
  icp identity default quorum-local 2>/dev/null || true
  exit 1
fi
icp identity default quorum-local 2>/dev/null || true

# ─── [7] getMember ───────────────────────────────────────────────────────────
echo ""
echo "── [7] getMember by principal ──────────────────────────────────────────"
GET_MEMBER=$(icp canister call $CANISTER getMember "(principal \"$MEMBER_B\")" -e local)
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
ALL=$(icp canister call $CANISTER getAllMembers -e local)
ACTIVE=$(icp canister call $CANISTER getActiveMembers -e local)
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
ROLE_OUT=$(icp canister call $CANISTER assignRole "(
  principal \"$MEMBER_B\",
  variant { BoardMember }
)" -e local)
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
IS_BOARD=$(icp canister call $CANISTER isBoardMember "(principal \"$MEMBER_B\")" -e local)
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
icp identity default quorum-member-b 2>/dev/null || true
icp canister call $CANISTER registerMember '(
  "12A",
  "Jordan Again",
  "jordan2@sunrise.hoa",
  "SUNRISE2024"
)' -e local && echo "  ↳ ❌ Expected AlreadyExists" || echo "  ✓ AlreadyExists returned"
icp identity default quorum-local 2>/dev/null || true

# ─── [V2] setCommunityProfile — empty name → InvalidInput ────────────────────
echo ""
echo "── [V2] setCommunityProfile empty name → expect InvalidInput ─────────────"
icp canister call $CANISTER setCommunityProfile '("", "addr", 10, "desc")' -e local \
  && echo "  ↳ ❌ Expected InvalidInput" || echo "  ✓ InvalidInput returned for empty name"

# ─── [V3] generateInviteCode — duplicate → AlreadyExists ────────────────────
echo ""
echo "── [V3] generateInviteCode duplicate → expect AlreadyExists ─────────────"
icp canister call $CANISTER generateInviteCode '("SUNRISE2024", 5, null)' -e local \
  && echo "  ↳ ❌ Expected AlreadyExists" || echo "  ✓ AlreadyExists returned for duplicate code"

# ─── [V4] registerMember with invalid code ───────────────────────────────────
echo ""
echo "── [V4] registerMember invalid code → expect InvalidCode ─────────────────"
icp canister call $CANISTER registerMember '("5B", "X", "x@y.com", "BADCODE")' -e local \
  && echo "  ↳ ❌ Expected InvalidCode" || echo "  ✓ InvalidCode returned for bad invite"

echo ""
echo "✅  Members canister tests passed"
