#!/usr/bin/env bash
set -euo pipefail

DEPLOY_SCRIPT_VERSION="0.4.0"
ENV=${1:-local}

echo "============================================"
echo "  Quorum — Deployment ($ENV) v${DEPLOY_SCRIPT_VERSION}"
echo "============================================"

# ── Identity setup ────────────────────────────────────────────────────────────
if [ "$ENV" != "local" ] && [ -n "${DFX_IDENTITY_PEM:-}" ]; then
  echo "▶ Loading ICP identity from DFX_IDENTITY_PEM secret..."
  IDENTITY_FILE=$(mktemp /tmp/icp-identity-XXXXXX.pem)
  printf '%s' "$DFX_IDENTITY_PEM" > "$IDENTITY_FILE"
  icp identity import ci-deploy --from-pem "$IDENTITY_FILE" --storage plaintext 2>/dev/null || true
  icp identity default ci-deploy
  rm -f "$IDENTITY_FILE"
  echo "  ✓ Identity loaded"
else
  _PRINCIPAL=$(icp identity principal 2>/dev/null || echo "2vxsx-fae")
  if [ "$_PRINCIPAL" = "2vxsx-fae" ]; then
    echo "▶ Creating local deploy identity (quorum-local)..."
    if ! icp identity new quorum-local --storage plaintext 2>/dev/null && \
       ! icp identity new quorum-local 2>/dev/null; then
      _ID_PEM=$(mktemp /tmp/qrm-deploy-XXXXXX.pem)
      openssl genpkey -algorithm Ed25519 -out "$_ID_PEM" 2>/dev/null
      icp identity import quorum-local --from-pem "$_ID_PEM" --storage plaintext 2>/dev/null || true
      rm -f "$_ID_PEM"
    fi
    icp identity default quorum-local 2>/dev/null || true
    echo "  ✓ Identity: $(icp identity principal)"
  fi
fi

# ── Mops toolchain ────────────────────────────────────────────────────────────
echo "▶ Initializing mops toolchain..."
mops toolchain init 2>/dev/null || true
MOC_BIN=$(mops toolchain bin moc 2>/dev/null) || MOC_BIN=""
if [ -z "$MOC_BIN" ]; then
  rm -rf .mops/_tmp
  mops toolchain init 2>/dev/null || true
  MOC_BIN=$(mops toolchain bin moc) || { echo "  ERROR: cannot resolve moc binary"; exit 1; }
fi
echo "  ✓ moc ready: $MOC_BIN"

# ── ic-wasm ───────────────────────────────────────────────────────────────────
if ! command -v ic-wasm >/dev/null 2>&1; then
  echo "▶ Downloading ic-wasm 0.9.11..."
  _TMP=$(mktemp -d)
  curl -sSfL \
    "https://github.com/dfinity/ic-wasm/releases/download/0.9.11/ic-wasm-x86_64-unknown-linux-musl.tar.xz" \
    -o "$_TMP/ic-wasm.tar.xz"
  tar -xJf "$_TMP/ic-wasm.tar.xz" -C "$_TMP"
  mkdir -p "$HOME/.local/bin"
  cp "$(find "$_TMP" -name "ic-wasm" -type f | head -1)" "$HOME/.local/bin/ic-wasm"
  chmod +x "$HOME/.local/bin/ic-wasm"
  export PATH="$HOME/.local/bin:$PATH"
  rm -rf "$_TMP"
fi
echo "  ✓ ic-wasm: $(ic-wasm --version 2>/dev/null | head -1)"

# ── Local network ─────────────────────────────────────────────────────────────
if [ "$ENV" = "local" ]; then
  echo "▶ Starting local ICP network..."
  if icp network ping local >/dev/null 2>&1; then
    echo "  ✓ Local network already running"
  else
    icp network stop 2>/dev/null || true
    icp network start -d
    echo "  ✓ Local network started"
  fi
fi

# ── Pre-flight (non-local) ────────────────────────────────────────────────────
if [ "$ENV" != "local" ]; then
  echo ""
  echo "============================================"
  echo "  Pre-flight Checks ($ENV)"
  echo "============================================"
  PREFLIGHT_FAILED=0

  if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
    echo "  ✗ STRIPE_SECRET_KEY not set"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ STRIPE_SECRET_KEY set"
  fi

  if [ -z "${VITE_STRIPE_PUBLISHABLE_KEY:-}" ]; then
    echo "  ✗ VITE_STRIPE_PUBLISHABLE_KEY not set"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ VITE_STRIPE_PUBLISHABLE_KEY set"
  fi

  if [ "$ENV" = "ic" ] && [[ "${STRIPE_SECRET_KEY:-}" == sk_test_* ]]; then
    echo "  ✗ Test Stripe key on mainnet — use live key for ic deploys"
    PREFLIGHT_FAILED=1
  fi

  CURRENT_PRINCIPAL=$(icp identity principal 2>/dev/null || echo "2vxsx-fae")
  if [ "$CURRENT_PRINCIPAL" = "2vxsx-fae" ]; then
    echo "  ✗ ICP identity is anonymous"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ ICP identity: $CURRENT_PRINCIPAL"
  fi

  if ! icp network ping "$ENV" >/dev/null 2>&1; then
    echo "  ✗ Network '$ENV' not reachable"
    PREFLIGHT_FAILED=1
  else
    echo "  ✓ Network reachable"
  fi

  if [ "$PREFLIGHT_FAILED" -ne 0 ]; then
    echo ""
    echo "❌ Pre-flight failed. Set the missing secrets and retry."
    exit 1
  fi
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo ""
  echo "✅ DRY_RUN=1 — validation passed. Exiting without deploying."
  exit 0
fi

# ── Canister deployment ───────────────────────────────────────────────────────
CANISTERS=(members governance treasury documents announcements)
DEPLOY_PRINCIPAL=$(icp identity principal)

# Seed icp-cli state from canister_ids.json on CI
if [ "$ENV" != "local" ] && [ -f "canister_ids.json" ] && command -v python3 >/dev/null 2>&1; then
  mkdir -p ".icp/data/mappings"
  ENV="$ENV" python3 - <<'PYEOF'
import json, os
env = os.environ.get("ENV", "")
src = json.load(open("canister_ids.json"))
flat = {k: v[env] for k, v in src.items() if isinstance(v, dict) and v.get(env)}
dest = f".icp/data/mappings/{env}.ids.json"
json.dump(flat, open(dest, "w"), indent=2)
print(f"  ✓ Seeded {len(flat)} canister IDs into {dest}")
PYEOF
fi

# Determine which canisters need creation
CANISTERS_TO_CREATE=()
if [ "$ENV" != "local" ] && [ -f "canister_ids.json" ] && command -v python3 >/dev/null 2>&1; then
  for _c in "${CANISTERS[@]}" frontend; do
    _id=$(python3 -c "import json; d=json.load(open('canister_ids.json')); print(d.get('$_c',{}).get('$ENV',''))" 2>/dev/null || echo "")
    [ -z "$_id" ] && CANISTERS_TO_CREATE+=("$_c")
  done
else
  CANISTERS_TO_CREATE=("${CANISTERS[@]}" frontend)
fi

# Fund cycles ledger for fresh canisters (non-local only)
if [ "$ENV" != "local" ] && [ ${#CANISTERS_TO_CREATE[@]} -gt 0 ] && [ -n "${DFX_WALLET_ID:-}" ]; then
  echo "▶ Funding cycles ledger for ${#CANISTERS_TO_CREATE[@]} new canisters..."
  _DFX_PEM=$(mktemp /tmp/dfx-pem-XXXXXX.pem)
  printf '%s' "$DFX_IDENTITY_PEM" > "$_DFX_PEM"
  dfx identity import --storage-mode=plaintext ci-deploy "$_DFX_PEM" 2>/dev/null || true
  dfx identity use ci-deploy
  dfx identity set-wallet "$DFX_WALLET_ID" --network ic
  rm -f "$_DFX_PEM"
  _FUND=$(( ${#CANISTERS_TO_CREATE[@]} * 2500000000000 ))
  dfx canister call um5iw-rqaaa-aaaaq-qaaba-cai deposit \
    "(record { to = record { owner = principal \"$DEPLOY_PRINCIPAL\"; subaccount = null }; memo = null; created_at_time = null })" \
    --with-cycles "$_FUND" --wallet "$DFX_WALLET_ID" --network ic || \
    echo "  ⚠️  Cycles deposit failed — ensure wallet has ≥ 15T before fresh deploy"
fi

if [ "$ENV" = "local" ]; then
  echo "▶ Minting local cycles..."
  icp cycles mint 500000000000000 -e local >/dev/null 2>&1 || true

  echo "▶ Deploying canisters..."
  for canister in "${CANISTERS[@]}"; do
    echo "  → $canister"
    icp deploy "$canister" -e local 2>&1 | tail -3
  done
else
  if [ ${#CANISTERS_TO_CREATE[@]} -gt 0 ]; then
    echo "▶ Creating ${#CANISTERS_TO_CREATE[@]} new canister slot(s)..."
    for canister in "${CANISTERS_TO_CREATE[@]}"; do
      [ "$canister" = "frontend" ] && continue
      icp canister create "$canister" -e "$ENV" || true
    done
  fi

  echo "▶ Building backend canisters..."
  for canister in "${CANISTERS[@]}"; do
    echo "  → $canister"
    icp build "$canister" -e "$ENV"
  done

  echo "▶ Installing backend canisters..."
  for canister in "${CANISTERS[@]}"; do
    echo "  → $canister"
    icp canister install "$canister" -e "$ENV" --mode upgrade 2>/dev/null || \
    icp canister install "$canister" -e "$ENV" --mode install
  done
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "▶ Building frontend..."
cd frontend
for canister in "${CANISTERS[@]}"; do
  _id=$(icp canister id "$canister" -e "$ENV" 2>/dev/null || echo "")
  [ -n "$_id" ] && export "VITE_CANISTER_ID_$(echo "$canister" | tr '[:lower:]' '[:upper:]')=$_id"
done
VITE_STRIPE_PUBLISHABLE_KEY="${VITE_STRIPE_PUBLISHABLE_KEY:-}" npm run build
cd ..

echo "▶ Deploying frontend..."
icp deploy frontend -e "$ENV" 2>/dev/null || \
  icp canister install frontend -e "$ENV" --mode upgrade 2>/dev/null || true

# ── Save canister IDs ─────────────────────────────────────────────────────────
if [ "$ENV" != "local" ]; then
  echo "▶ Saving canister IDs to canister_ids.json..."
  _ENV="$ENV" python3 - <<'PYEOF'
import json, subprocess, os
env = os.environ.get("_ENV", "")
try:
    existing = json.load(open("canister_ids.json"))
except Exception:
    existing = {}
for name in ["members","governance","treasury","documents","announcements","frontend"]:
    result = subprocess.run(["icp","canister","id",name,"-e",env],
                            capture_output=True, text=True)
    cid = result.stdout.strip()
    if cid:
        existing.setdefault(name, {})[env] = cid
json.dump(existing, open("canister_ids.json","w"), indent=2)
print("  ✓ canister_ids.json updated")
PYEOF
fi

echo ""
echo "✅ Quorum deployed to $ENV"
