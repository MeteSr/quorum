#!/usr/bin/env bash
# Integration tests for the discussions canister
set -euo pipefail
CANISTER="discussions"
ENV="${1:-local}"
PASS=0; FAIL=0

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL+1)); }
run()  { icp canister call "$CANISTER" "$1" "$2" -e "$ENV" 2>/dev/null; }

echo "================================================"
echo "  Discussions Canister — Integration Tests"
echo "================================================"

# 1. Create a General post
echo "▶ 1. createPost (General)"
R=$(run createPost '("Community BBQ", "Is anyone interested in organizing a community BBQ this summer?", variant { General })')
echo "$R" | grep -q "ok" && ok "post created" || fail "createPost failed"
POST_ID=$(echo "$R" | grep -o '"POST_[0-9]*"' | head -1 | tr -d '"')

# 2. Create a NeighborHelp post
echo "▶ 2. createPost (NeighborHelp)"
R=$(run createPost '("Plumber recommendation", "Looking for a reliable plumber for a small leak fix.", variant { NeighborHelp })')
echo "$R" | grep -q "ok" && ok "second post created" || fail "second createPost failed"
POST2_ID=$(echo "$R" | grep -o '"POST_[0-9]*"' | head -1 | tr -d '"')

# 3. getAllPosts returns both
echo "▶ 3. getAllPosts"
R=$(run getAllPosts '()')
COUNT=$(echo "$R" | grep -c '"POST_' || true)
[ "$COUNT" -ge 2 ] && ok "getAllPosts returns ≥2 posts" || fail "getAllPosts returned < 2"

# 4. getPost by id
echo "▶ 4. getPost"
R=$(run getPost "(\"$POST_ID\")")
echo "$R" | grep -q "Community BBQ" && ok "getPost returns correct post" || fail "getPost returned wrong data"

# 5. getPostsByCategory (NeighborHelp)
echo "▶ 5. getPostsByCategory (NeighborHelp)"
R=$(run getPostsByCategory '(variant { NeighborHelp })')
echo "$R" | grep -q "Plumber recommendation" && ok "category filter works" || fail "getPostsByCategory failed"

# 6. addReply to first post
echo "▶ 6. addReply"
R=$(run addReply "(\"$POST_ID\", \"Count me in! I can bring my grill.\")")
echo "$R" | grep -q "ok" && ok "reply added" || fail "addReply failed"
REPLY_ID=$(echo "$R" | grep -o '"REPLY_[0-9]*"' | head -1 | tr -d '"')

# 7. addReply again (replyCount should increment)
echo "▶ 7. addReply again"
R=$(run addReply "(\"$POST_ID\", \"Great idea — I'll bring drinks!\")")
echo "$R" | grep -q "ok" && ok "second reply added" || fail "second addReply failed"

# 8. getRepliesForPost
echo "▶ 8. getRepliesForPost"
R=$(run getRepliesForPost "(\"$POST_ID\")")
COUNT=$(echo "$R" | grep -c '"REPLY_' || true)
[ "$COUNT" -ge 2 ] && ok "getRepliesForPost returns ≥2 replies" || fail "getRepliesForPost returned < 2"

# 9. getPost shows updated replyCount
echo "▶ 9. replyCount updated"
R=$(run getPost "(\"$POST_ID\")")
echo "$R" | grep -q "replyCount = 2" && ok "replyCount is 2" || fail "replyCount not updated"

# 10. pinPost
echo "▶ 10. pinPost"
R=$(run pinPost "(\"$POST_ID\")")
echo "$R" | grep -q "ok" && ok "post pinned" || fail "pinPost failed"

# 11. getPinnedPosts
echo "▶ 11. getPinnedPosts"
R=$(run getPinnedPosts '()')
echo "$R" | grep -q "Community BBQ" && ok "pinned post appears in getPinnedPosts" || fail "getPinnedPosts missing post"

# 12. lockPost
echo "▶ 12. lockPost"
R=$(run lockPost "(\"$POST2_ID\")")
echo "$R" | grep -q "ok" && ok "post locked" || fail "lockPost failed"

# 13. addReply to locked post → Locked error
echo "▶ 13. addReply to locked post → Locked"
R=$(run addReply "(\"$POST2_ID\", \"This should fail.\")")
echo "$R" | grep -q "Locked" && ok "addReply to locked post returns Locked" || fail "expected Locked error"

# 14. deletePost (own post)
echo "▶ 14. deletePost"
R=$(run deletePost "(\"$POST_ID\")")
echo "$R" | grep -q "ok" && ok "post deleted" || fail "deletePost failed"

# 15. getPost after delete → null
echo "▶ 15. getPost after delete → null"
R=$(run getPost "(\"$POST_ID\")")
echo "$R" | grep -q "null" && ok "deleted post returns null" || fail "expected null after delete"

# ─── Validation Guards ────────────────────────────────────────────────────────
echo ""
echo "▶ Validation guards"

# 16. createPost with empty title → InvalidInput
R=$(run createPost '("", "some body", variant { General })')
echo "$R" | grep -q "InvalidInput" && ok "empty title → InvalidInput" || fail "expected InvalidInput for empty title"

# 17. createPost with empty body → InvalidInput
R=$(run createPost '("A title", "", variant { General })')
echo "$R" | grep -q "InvalidInput" && ok "empty body → InvalidInput" || fail "expected InvalidInput for empty body"

# 18. addReply with empty body → InvalidInput
R=$(run addReply "(\"$POST2_ID\", \"\")")
echo "$R" | grep -q "InvalidInput" && ok "empty reply body → InvalidInput" || fail "expected InvalidInput for empty reply"

# 19. getPost unknown id → null
R=$(run getPost '("POST_99999")')
echo "$R" | grep -q "null" && ok "unknown getPost → null" || fail "expected null for unknown post"

# 20. deletePost unknown id → NotFound
R=$(run deletePost '("POST_99999")')
echo "$R" | grep -q "NotFound" && ok "deletePost unknown → NotFound" || fail "expected NotFound"

echo ""
echo "================================================"
echo "  Results: $PASS passed, $FAIL failed"
echo "================================================"
[ "$FAIL" -eq 0 ] || exit 1
