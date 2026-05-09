#!/usr/bin/env bash
# Quorum deploy script — v0.1.0
set -euo pipefail

NETWORK="${DFX_NETWORK:-local}"
echo "Deploying Quorum to network: $NETWORK"

# ── Deploy canisters ──────────────────────────────────────────────────────────

icp canister deploy members       --network "$NETWORK"
icp canister deploy governance    --network "$NETWORK"
icp canister deploy treasury      --network "$NETWORK"
icp canister deploy documents     --network "$NETWORK"
icp canister deploy announcements --network "$NETWORK"

# ── Capture canister IDs ──────────────────────────────────────────────────────

MEMBERS_ID=$(icp canister id members       --network "$NETWORK")
GOVERNANCE_ID=$(icp canister id governance  --network "$NETWORK")
TREASURY_ID=$(icp canister id treasury      --network "$NETWORK")
DOCUMENTS_ID=$(icp canister id documents    --network "$NETWORK")
ANNOUNCEMENTS_ID=$(icp canister id announcements --network "$NETWORK")

echo "CANISTER_ID_MEMBERS=$MEMBERS_ID"
echo "CANISTER_ID_GOVERNANCE=$GOVERNANCE_ID"
echo "CANISTER_ID_TREASURY=$TREASURY_ID"
echo "CANISTER_ID_DOCUMENTS=$DOCUMENTS_ID"
echo "CANISTER_ID_ANNOUNCEMENTS=$ANNOUNCEMENTS_ID"

# ── Write .env ────────────────────────────────────────────────────────────────

cat > .env <<EOF
DFX_NETWORK=$NETWORK
CANISTER_ID_MEMBERS=$MEMBERS_ID
CANISTER_ID_GOVERNANCE=$GOVERNANCE_ID
CANISTER_ID_TREASURY=$TREASURY_ID
CANISTER_ID_DOCUMENTS=$DOCUMENTS_ID
CANISTER_ID_ANNOUNCEMENTS=$ANNOUNCEMENTS_ID
EOF

# ── Wire cross-canister IDs ───────────────────────────────────────────────────

icp canister call governance    setMembersCanisterId "(\"$MEMBERS_ID\")"   --network "$NETWORK"
icp canister call treasury      setMembersCanisterId "(\"$MEMBERS_ID\")"   --network "$NETWORK"

# ── Build and deploy frontend ─────────────────────────────────────────────────

cd frontend
npm install
npm run build
cd ..

icp canister deploy frontend --network "$NETWORK"

FRONTEND_ID=$(icp canister id frontend --network "$NETWORK")
echo ""
echo "Quorum deployed."
echo "Frontend: https://$FRONTEND_ID.icp0.io"
