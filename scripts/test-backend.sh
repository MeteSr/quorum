#!/usr/bin/env bash
# Quorum — Backend Test Coordinator
#
# Runs each canister's test.sh in parallel, collects output to per-canister log
# files, prints them sequentially once all suites finish, and exits non-zero if
# any canister failed.
#
# Parallelism is safe because every canister test operates on its own
# canister — no shared mutable state between suites.
#
# Usage:
#   bash scripts/test-backend.sh                        # Run all canisters
#   bash scripts/test-backend.sh members governance     # Run only specified

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Verify replica is running ─────────────────────────────────────────────────
if ! dfx ping >/dev/null 2>&1; then
  echo "❌  Local dfx replica is not running. Run: dfx start --background"
  exit 1
fi

# ── Canister list ─────────────────────────────────────────────────────────────
ALL_CANISTERS=(
  members
  governance
  treasury
  documents
  announcements
  maintenance
)

if [ $# -gt 0 ]; then
  CANISTERS=("$@")
else
  CANISTERS=("${ALL_CANISTERS[@]}")
fi

# ── Result tracking ───────────────────────────────────────────────────────────
declare -a PASSED=()
declare -a FAILED=()
declare -a SKIPPED=()
declare -a ACTIVE=()
declare -a PIDS=()

LOG_DIR=$(mktemp -d /tmp/quorum-test-XXXXXX)

echo "============================================"
echo "  Quorum — Backend Test Suite"
echo "============================================"
echo "  Launching ${#CANISTERS[@]} canister suite(s) in parallel"
echo ""

# ── Launch all suites in parallel ────────────────────────────────────────────
for CANISTER in "${CANISTERS[@]}"; do
  TEST_SCRIPT="$REPO_ROOT/backend/$CANISTER/test.sh"

  if [ ! -f "$TEST_SCRIPT" ]; then
    echo "  ⬜ $CANISTER — no test.sh, skipping"
    SKIPPED+=("$CANISTER")
    continue
  fi

  CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")
  if [ -z "$CANISTER_ID" ]; then
    echo "  ⬜ $CANISTER — not deployed, skipping"
    SKIPPED+=("$CANISTER")
    continue
  fi

  date +%s > "$LOG_DIR/$CANISTER.start"
  bash "$TEST_SCRIPT" > "$LOG_DIR/$CANISTER.log" 2>&1 &
  PIDS+=($!)
  ACTIVE+=("$CANISTER")
  echo "  ▶ $CANISTER launched (pid $!)"
done

echo ""
echo "  Waiting for ${#ACTIVE[@]} suite(s)..."
echo ""

# ── Collect results in launch order ──────────────────────────────────────────
for i in "${!ACTIVE[@]}"; do
  CANISTER="${ACTIVE[$i]}"
  PID="${PIDS[$i]}"
  START_S=$(cat "$LOG_DIR/$CANISTER.start")

  wait "$PID"
  EXIT_CODE=$?

  END_S=$(date +%s)
  ELAPSED=$(( END_S - START_S ))

  if [ "$EXIT_CODE" -eq 0 ]; then
    echo "   ✅  $CANISTER passed (${ELAPSED}s)"
    PASSED+=("$CANISTER")
  else
    echo ""
    echo "── [$CANISTER FAILED — full output] ──────────────────────────────────"
    cat "$LOG_DIR/$CANISTER.log"
    echo ""
    ASSERTIONS=$(grep -n " ↳ ❌ " "$LOG_DIR/$CANISTER.log" || true)
    if [ -n "$ASSERTIONS" ]; then
      echo "   ── Assertion failures ─────────────────────────────────────────"
      echo "$ASSERTIONS"
      echo ""
    fi
    echo "   ── Last 20 lines ──────────────────────────────────────────────"
    tail -20 "$LOG_DIR/$CANISTER.log"
    echo ""
    echo "   ❌  $CANISTER FAILED (${ELAPSED}s)"
    FAILED+=("$CANISTER")
  fi
done

rm -rf "$LOG_DIR"

# ── Summary table ─────────────────────────────────────────────────────────────
TOTAL=$(( ${#PASSED[@]} + ${#FAILED[@]} + ${#SKIPPED[@]} ))

echo ""
echo "============================================"
echo "  Test Coverage Summary"
echo "============================================"
printf "  %-18s  %s\n" "Canister" "Result"
printf "  %-18s  %s\n" "------------------" "--------"
for C in "${PASSED[@]}";  do printf "  %-18s  ✅ Pass\n" "$C"; done
for C in "${FAILED[@]}";  do printf "  %-18s  ❌ FAIL\n" "$C"; done
for C in "${SKIPPED[@]}"; do printf "  %-18s  ⬜ Skip\n" "$C"; done

echo ""
printf "  Total: %d  |  Pass: %d  |  Fail: %d  |  Skip: %d\n" \
  "$TOTAL" "${#PASSED[@]}" "${#FAILED[@]}" "${#SKIPPED[@]}"
echo "============================================"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "❌  ${#FAILED[@]} canister test(s) failed: ${FAILED[*]}"
  exit 1
fi

echo ""
echo "✅  All ${#PASSED[@]} canister test(s) passed!"
exit 0
