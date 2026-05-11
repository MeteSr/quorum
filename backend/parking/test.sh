#!/usr/bin/env bash
# Quorum — Parking Canister Tests
#
# Tests: registerVehicle, issuePermit, logViolation, authorizeTow,
#        lookupVehicle, getVehiclesForUnit, getPermitsForVehicle,
#        getAllParkingViolations, invalid-input guards.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CANISTER="parking"
CANISTER_ID=$(dfx canister id "$CANISTER" 2>/dev/null || echo "")

if [ -z "$CANISTER_ID" ]; then
  echo "  ⬜ $CANISTER not deployed — skipping"
  exit 0
fi

echo "============================================"
echo "  Parking Canister — Test Suite"
echo "============================================"
echo "  Canister: $CANISTER_ID"
echo ""

# ── [1] registerVehicle ───────────────────────────────────────────────────────
echo "── [1] registerVehicle ──"
OUT=$(dfx --identity default canister call "$CANISTER" registerVehicle \
  '("unit-7C", "Toyota", "Camry", 2022, "Silver", "ABC1234", "TX")' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "VEH_" || { echo " ↳ ❌ registerVehicle did not return VEH_ id"; exit 1; }
echo " ↳ ok"
echo ""

VEHICLE_ID=$(echo "$OUT" | grep -oP 'VEH_\d+' | head -1)
if [ -z "$VEHICLE_ID" ]; then
  echo " ↳ ❌ Could not extract vehicle ID"
  exit 1
fi
echo "  Vehicle ID: $VEHICLE_ID"
echo ""

# ── [2] registerVehicle — second vehicle ──────────────────────────────────────
echo "── [2] registerVehicle (second vehicle, unit-7C) ──"
OUT=$(dfx --identity default canister call "$CANISTER" registerVehicle \
  '("unit-7C", "Honda", "CR-V", 2020, "Blue", "XYZ5678", "TX")' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "VEH_" || { echo " ↳ ❌ second registerVehicle failed"; exit 1; }
echo " ↳ ok"
echo ""

# ── [3] getVehiclesForUnit ────────────────────────────────────────────────────
echo "── [3] getVehiclesForUnit(unit-7C) ──"
OUT=$(dfx --identity default canister call "$CANISTER" getVehiclesForUnit '("unit-7C")' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "VEH_" || { echo " ↳ ❌ getVehiclesForUnit returned no vehicles"; exit 1; }
echo " ↳ ok"
echo ""

# ── [4] issuePermit — resident ────────────────────────────────────────────────
echo "── [4] issuePermit (Resident, no expiry) ──"
OUT=$(dfx --identity default canister call "$CANISTER" issuePermit \
  "(\"$VEHICLE_ID\", variant { Resident }, null)" 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "PRK-" || { echo " ↳ ❌ issuePermit did not return PRK- number"; exit 1; }
echo " ↳ ok"
echo ""

PERMIT_ID=$(echo "$OUT" | grep -oP 'PRM_\d+' | head -1)
echo "  Permit ID: $PERMIT_ID"
echo ""

# ── [5] getPermitsForVehicle ──────────────────────────────────────────────────
echo "── [5] getPermitsForVehicle($VEHICLE_ID) ──"
OUT=$(dfx --identity default canister call "$CANISTER" getPermitsForVehicle "(\"$VEHICLE_ID\")" 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "PRK-" || { echo " ↳ ❌ getPermitsForVehicle returned no permits"; exit 1; }
echo " ↳ ok"
echo ""

# ── [6] logViolation ─────────────────────────────────────────────────────────
echo "── [6] logViolation (Warning) ──"
OUT=$(dfx --identity default canister call "$CANISTER" logViolation \
  '("DEF9999", "TX", "Lot A, Space 3", "Parked in reserved handicap space without permit", null, variant { Warning })' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "PKV_" || { echo " ↳ ❌ logViolation did not return PKV_ id"; exit 1; }
echo " ↳ ok"
echo ""

VIOLATION_ID=$(echo "$OUT" | grep -oP 'PKV_\d+' | head -1)
echo "  Violation ID: $VIOLATION_ID"
echo ""

# ── [7] getAllParkingViolations ───────────────────────────────────────────────
echo "── [7] getAllParkingViolations ──"
OUT=$(dfx --identity default canister call "$CANISTER" getAllParkingViolations 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "PKV_" || { echo " ↳ ❌ getAllParkingViolations returned no records"; exit 1; }
echo " ↳ ok"
echo ""

# ── [8] logViolation — Tow notice ─────────────────────────────────────────────
echo "── [8] logViolation (Tow notice) ──"
OUT=$(dfx --identity default canister call "$CANISTER" logViolation \
  '("GHI3333", "TX", "Fire lane — main entrance", "Blocking fire lane, vehicle must be towed", null, variant { Tow })' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "PKV_" || { echo " ↳ ❌ Tow notice logViolation failed"; exit 1; }
echo " ↳ ok"
echo ""

TOW_VIOLATION_ID=$(echo "$OUT" | grep -oP 'PKV_\d+' | head -1)

# ── [9] authorizeTow ──────────────────────────────────────────────────────────
echo "── [9] authorizeTow($TOW_VIOLATION_ID) ──"
OUT=$(dfx --identity default canister call "$CANISTER" authorizeTow "(\"$TOW_VIOLATION_ID\")" 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "true" || { echo " ↳ ❌ authorizeTow did not set towAuthorized=true"; exit 1; }
echo " ↳ ok"
echo ""

# ── [10] lookupVehicle ────────────────────────────────────────────────────────
echo "── [10] lookupVehicle(TX, ABC1234) ──"
OUT=$(dfx --identity default canister call "$CANISTER" lookupVehicle '("TX", "ABC1234")' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "unit-7C" || { echo " ↳ ❌ lookupVehicle did not return registered unit"; exit 1; }
echo " ↳ ok"
echo ""

# ── Validation guards ─────────────────────────────────────────────────────────
echo "── [V1] registerVehicle rejects empty licensePlate ──"
OUT=$(dfx --identity default canister call "$CANISTER" registerVehicle \
  '("unit-7C", "Toyota", "Corolla", 2021, "Red", "", "TX")' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "InvalidInput" || { echo " ↳ ❌ empty licensePlate was not rejected"; exit 1; }
echo " ↳ ok"
echo ""

echo "── [V2] logViolation rejects empty location ──"
OUT=$(dfx --identity default canister call "$CANISTER" logViolation \
  '("ABC0000", "TX", "", "No location given", null, variant { Warning })' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "InvalidInput" || { echo " ↳ ❌ empty location was not rejected"; exit 1; }
echo " ↳ ok"
echo ""

echo "── [V3] issuePermit returns NotFound for unknown vehicle ──"
OUT=$(dfx --identity default canister call "$CANISTER" issuePermit \
  '("VEH_9999", variant { Guest }, null)' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "NotFound" || { echo " ↳ ❌ unknown vehicle should return NotFound"; exit 1; }
echo " ↳ ok"
echo ""

echo "── [V4] lookupVehicle returns null for unregistered plate ──"
OUT=$(dfx --identity default canister call "$CANISTER" lookupVehicle '("TX", "NOTEXIST")' 2>&1)
echo "$OUT"
echo "$OUT" | grep -q "null" || { echo " ↳ ❌ unregistered plate should return null"; exit 1; }
echo " ↳ ok"
echo ""

echo "============================================"
echo "  ✅  Parking tests passed"
echo "============================================"
