#!/usr/bin/env bash
# Quorum deploy script — v0.2.0
set -euo pipefail

NETWORK="${1:-local}"
echo "Deploying Quorum to network: $NETWORK"

# ── Identity setup (CI/CD only) ───────────────────────────────────────────────

if [ -n "${DFX_IDENTITY_PEM:-}" ]; then
  echo "$DFX_IDENTITY_PEM" > /tmp/quorum-identity.pem
  dfx identity import --storage-mode plaintext quorum-deploy /tmp/quorum-identity.pem 2>/dev/null || true
  dfx identity use quorum-deploy
  rm -f /tmp/quorum-identity.pem
  echo "Using quorum-deploy identity (from DFX_IDENTITY_PEM)"
fi

# ── Deploy backend canisters ──────────────────────────────────────────────────

for canister in members governance treasury documents announcements; do
  echo "Deploying $canister…"
  dfx deploy "$canister" --network "$NETWORK"
done

# ── Capture canister IDs ──────────────────────────────────────────────────────

MEMBERS_ID=$(dfx canister id members       --network "$NETWORK")
GOVERNANCE_ID=$(dfx canister id governance  --network "$NETWORK")
TREASURY_ID=$(dfx canister id treasury      --network "$NETWORK")
DOCUMENTS_ID=$(dfx canister id documents    --network "$NETWORK")
ANNOUNCEMENTS_ID=$(dfx canister id announcements --network "$NETWORK")

echo "CANISTER_ID_MEMBERS=$MEMBERS_ID"
echo "CANISTER_ID_GOVERNANCE=$GOVERNANCE_ID"
echo "CANISTER_ID_TREASURY=$TREASURY_ID"
echo "CANISTER_ID_DOCUMENTS=$DOCUMENTS_ID"
echo "CANISTER_ID_ANNOUNCEMENTS=$ANNOUNCEMENTS_ID"

# ── Wire cross-canister IDs ───────────────────────────────────────────────────

dfx canister call governance setMembersCanisterId "(\"$MEMBERS_ID\")"   --network "$NETWORK"
dfx canister call treasury   setMembersCanisterId "(\"$MEMBERS_ID\")"   --network "$NETWORK"

# ── Bootstrap admin (local only — testnet/mainnet uses identity principal) ────

if [ "$NETWORK" = "local" ]; then
  dfx canister call members initAdmin --network local || true
fi

# ── Write .env ────────────────────────────────────────────────────────────────

cat > .env <<EOF
DFX_NETWORK=$NETWORK
CANISTER_ID_MEMBERS=$MEMBERS_ID
CANISTER_ID_GOVERNANCE=$GOVERNANCE_ID
CANISTER_ID_TREASURY=$TREASURY_ID
CANISTER_ID_DOCUMENTS=$DOCUMENTS_ID
CANISTER_ID_ANNOUNCEMENTS=$ANNOUNCEMENTS_ID
EOF

# ── Build and deploy frontend ─────────────────────────────────────────────────
# Must build after writing .env so Vite injects the correct canister IDs.

cd frontend
npm install
CANISTER_ID_MEMBERS="$MEMBERS_ID" \
CANISTER_ID_GOVERNANCE="$GOVERNANCE_ID" \
CANISTER_ID_TREASURY="$TREASURY_ID" \
CANISTER_ID_DOCUMENTS="$DOCUMENTS_ID" \
CANISTER_ID_ANNOUNCEMENTS="$ANNOUNCEMENTS_ID" \
  npm run build
cd ..

dfx deploy frontend --network "$NETWORK"

FRONTEND_ID=$(dfx canister id frontend --network "$NETWORK")
echo ""
echo "✓ Quorum deployed to $NETWORK"
if [ "$NETWORK" = "ic" ]; then
  echo "  Frontend: https://$FRONTEND_ID.icp0.io"
else
  echo "  Frontend: http://$FRONTEND_ID.localhost:8000"
fi
