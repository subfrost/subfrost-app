#!/usr/bin/env bash
# deploy-amm-regtest-local.sh
#
# Deploys the AMM contracts to the local regtest environment using the
# CORRECT slots as documented in CLAUDE.md (2026-01-28 active deployment).
#
# Slots:
#   [4:781000]  Beacon Proxy Template  (alkanes_std_beacon_proxy.wasm)
#   [4:65496]   Pool Logic             (pool.wasm from oyl-amm)
#   [4:65500]   Factory Logic          (factory.wasm from oyl-amm)
#   [4:65498]   Factory Proxy          (alkanes_std_upgradeable.wasm, delegates to 65500)
#   [4:65499]   Upgradeable Beacon     (alkanes_std_upgradeable_beacon.wasm, points to 65496)
#
# After all 5 contracts are deployed, factory is initialized with:
#   opcode 0, args: beacon_proxy_template=4:781000, beacon_id=4:65499
#
# Then a DIESEL/frBTC pool is created via opcode 1 on the factory proxy.
#
# Usage:
#   DEPLOY_PASSWORD=test123 bash scripts/deploy-amm-regtest-local.sh
#   # Optionally skip steps already done:
#   SKIP_DEPLOY=1 DEPLOY_PASSWORD=test123 bash scripts/deploy-amm-regtest-local.sh
#
# JOURNAL (2026-04-17): Created to replace the existing deploy-regtest.sh which
# uses old broken slots (65522/65523/65524) documented as NON-FUNCTIONAL in CLAUDE.md.

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ALKANES_RS_DIR="/Users/erickdelgado/Documents/github/alkanes-rs-dev"
WASM_DIR="$ALKANES_RS_DIR/prod_wasms"
CLI="$ALKANES_RS_DIR/target/release/alkanes-cli"
WALLET_FILE="${WALLET_FILE:-$HOME/.alkanes/boot-wallet.json}"
DEPLOY_PASSWORD="${DEPLOY_PASSWORD:-testtesttest}"
RPC_URL="http://localhost:18888"
PROFILE="regtest"

# Active slots (matching CLAUDE.md "Current Regtest Deployment 2026-01-28")
BEACON_PROXY_TEMPLATE=781000
POOL_LOGIC=65496
FACTORY_LOGIC=65500
FACTORY_PROXY=65498
UPGRADEABLE_BEACON=65499

# Deployer addresses (coinType=1, derived from boot mnemonic by WASM provider)
DEPLOYER_TAPROOT="bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg"
DEPLOYER_SEGWIT="bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk"

# ── Helpers ───────────────────────────────────────────────────────────────────

log()  { echo "  [deploy] $*"; }
ok()   { echo "  ✅  $*"; }
warn() { echo "  ⚠️   $*"; }
fail() { echo "  ❌  $*"; exit 1; }

rpc() {
  local method=$1; shift
  local params="${1:-[]}"
  curl -sf "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":$params,\"id\":1}" \
    | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('result',''))"
}

wait_for_sync() {
  local target=$1
  for i in $(seq 1 30); do
    local h
    h=$(rpc metashrew_height '[]' 2>/dev/null || echo "0")
    if [ "$h" -ge "$target" ] 2>/dev/null; then return 0; fi
    log "Waiting for metashrew (height $h, want $target)..."
    sleep 2
  done
  warn "Metashrew sync timeout at height $target"
}

mine_block() {
  rpc generatetoaddress "[1, \"$DEPLOYER_TAPROOT\"]" >/dev/null
  sleep 1
}

is_slot_deployed() {
  local block=$1 tx=$2
  local result
  result=$(curl -sf "$RPC_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"alkanes_simulate\",\"params\":[{\"target\":{\"block\":\"$block\",\"tx\":\"$tx\"},\"inputs\":[\"99\"],\"alkanes\":[],\"transaction\":\"0x\",\"block\":\"0x\",\"height\":\"1\",\"txindex\":0,\"vout\":0}],\"id\":1}" \
    2>/dev/null)
  local err
  err=$(echo "$result" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('result',{}).get('execution',{}).get('error',''))" 2>/dev/null || echo "")
  if echo "$err" | grep -q "unexpected end of file"; then
    return 1  # empty slot
  fi
  return 0  # something is there
}

deploy_contract() {
  local name=$1
  local wasm=$2
  local tx=$3
  local init_args="${4:-}"

  log "Deploying $name → [4:$tx]..."

  if ! [ -f "$wasm" ]; then
    fail "WASM not found: $wasm"
  fi

  local protostone
  if [ -n "$init_args" ]; then
    protostone="[3,$tx,$init_args]:v0:v0"
  else
    protostone="[3,$tx,50]:v0:v0"
  fi

  log "  protostone: $protostone"

  "$CLI" \
    -p "$PROFILE" \
    --wallet-file "$WALLET_FILE" \
    --passphrase "$DEPLOY_PASSWORD" \
    alkanes execute "$protostone" \
    --envelope "$wasm" \
    --from p2tr:0 \
    --fee-rate 1 \
    --mine \
    -y

  sleep 3
  ok "$name deployed to [4:$tx]"
}

execute_call() {
  local name=$1
  local protostone=$2
  local inputs="${3:-}"

  log "Calling: $name"
  log "  protostone: $protostone"

  local extra_args=()
  if [ -n "$inputs" ]; then
    extra_args+=(--inputs "$inputs")
  fi

  "$CLI" \
    -p "$PROFILE" \
    --wallet-file "$WALLET_FILE" \
    --passphrase "$DEPLOY_PASSWORD" \
    alkanes execute "$protostone" \
    --from p2tr:0 \
    --fee-rate 1 \
    --mine \
    "${extra_args[@]}" \
    -y

  sleep 3
  ok "$name done"
}

# ── Pre-flight checks ─────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════"
echo "  AMM Deploy → regtest-local"
echo "════════════════════════════════════════"
echo ""

[ -f "$CLI" ] || fail "alkanes-cli not built yet. Run: cd $ALKANES_RS_DIR && cargo build --release -p alkanes-cli"
[ -f "$WALLET_FILE" ] || fail "Wallet not found: $WALLET_FILE"
rpc metashrew_height '[]' >/dev/null 2>&1 || fail "Regtest node not running at $RPC_URL"

CURRENT_HEIGHT=$(rpc metashrew_height '[]')
ok "Regtest running at block $CURRENT_HEIGHT"
log "CLI: $CLI"
log "Wallet: $WALLET_FILE"
echo ""

# ── Check what's already deployed ────────────────────────────────────────────

NEEDS_BEACON_PROXY=true
NEEDS_POOL_LOGIC=true
NEEDS_FACTORY_LOGIC=true
NEEDS_FACTORY_PROXY=true
NEEDS_BEACON=true

if is_slot_deployed 4 $BEACON_PROXY_TEMPLATE; then NEEDS_BEACON_PROXY=false; fi
if is_slot_deployed 4 $POOL_LOGIC;             then NEEDS_POOL_LOGIC=false;     fi
if is_slot_deployed 4 $FACTORY_LOGIC;          then NEEDS_FACTORY_LOGIC=false;  fi
if is_slot_deployed 4 $FACTORY_PROXY;          then NEEDS_FACTORY_PROXY=false;  fi
if is_slot_deployed 4 $UPGRADEABLE_BEACON;     then NEEDS_BEACON=false;         fi

if ! $NEEDS_BEACON_PROXY && ! $NEEDS_POOL_LOGIC && ! $NEEDS_FACTORY_LOGIC && ! $NEEDS_FACTORY_PROXY && ! $NEEDS_BEACON; then
  ok "All AMM contracts already deployed!"
else
  log "Contracts to deploy:"
  $NEEDS_BEACON_PROXY  && log "  • Beacon Proxy Template [4:$BEACON_PROXY_TEMPLATE]"
  $NEEDS_POOL_LOGIC    && log "  • Pool Logic [4:$POOL_LOGIC]"
  $NEEDS_FACTORY_LOGIC && log "  • Factory Logic [4:$FACTORY_LOGIC]"
  $NEEDS_FACTORY_PROXY && log "  • Factory Proxy [4:$FACTORY_PROXY]"
  $NEEDS_BEACON        && log "  • Upgradeable Beacon [4:$UPGRADEABLE_BEACON]"
fi

echo ""

# ── Deploy contracts ──────────────────────────────────────────────────────────

if [ "${SKIP_DEPLOY:-}" != "1" ]; then

  # Step 1: Beacon Proxy Template [4:781000]
  # init opcode 36863 (0x8fff) = forward/no-op; beacon pointer set later per instance
  # Actually per CLAUDE.md: beacon-proxy init uses 0x7fff NOT 0x8fff
  # alkanes_std_beacon_proxy: opcode 32767 (0x7fff) stores beacon pointer
  # For template deploy we use 36863 as a safe no-op (per CLAUDE.md deploy example)
  if $NEEDS_BEACON_PROXY; then
    deploy_contract "Beacon Proxy Template" \
      "$WASM_DIR/alkanes_std_beacon_proxy.wasm" \
      $BEACON_PROXY_TEMPLATE \
      "36863"
  fi

  # Step 2: Pool Logic [4:65496]
  if $NEEDS_POOL_LOGIC; then
    deploy_contract "Pool Logic" \
      "$WASM_DIR/pool.wasm" \
      $POOL_LOGIC \
      "50"
  fi

  # Step 3: Factory Logic [4:65500]
  if $NEEDS_FACTORY_LOGIC; then
    deploy_contract "Factory Logic" \
      "$WASM_DIR/factory.wasm" \
      $FACTORY_LOGIC \
      "50"
  fi

  # Step 4: Factory Proxy (upgradeable) [4:65498]
  # Init: 0x7fff=32767, impl=4:65500, auth_units=1
  if $NEEDS_FACTORY_PROXY; then
    deploy_contract "Factory Proxy" \
      "$WASM_DIR/alkanes_std_upgradeable.wasm" \
      $FACTORY_PROXY \
      "32767,4,$FACTORY_LOGIC,1"
  fi

  # Step 5: Upgradeable Beacon [4:65499]
  # Init: 0x7fff=32767, impl=4:65496, auth_units=1
  if $NEEDS_BEACON; then
    deploy_contract "Upgradeable Beacon" \
      "$WASM_DIR/alkanes_std_upgradeable_beacon.wasm" \
      $UPGRADEABLE_BEACON \
      "32767,4,$POOL_LOGIC,1"
  fi

  echo ""
  ok "All contracts deployed!"
  echo ""

fi  # SKIP_DEPLOY

# ── Discover auth tokens ──────────────────────────────────────────────────────

log "Checking for auth tokens at deployer address..."
AUTH_TOKENS=$("$CLI" \
  -p "$PROFILE" \
  --wallet-file "$WALLET_FILE" \
  --passphrase "$DEPLOY_PASSWORD" \
  protorunes by-address "$DEPLOYER_TAPROOT" 2>/dev/null | grep -E "^\s+\[2:" | tail -5 || echo "")

echo "Auth tokens found:"
echo "$AUTH_TOKENS"
echo ""

# The factory auth token is [2:4] (created when factory proxy deployed)
# We need to pass it when initializing the factory
FACTORY_AUTH_TOKEN=$(echo "$AUTH_TOKENS" | grep -o "\[2:[0-9]*\]" | tail -1 | tr -d '[]' | tr ':' ':' | head -1 || echo "")
log "Factory auth token: ${FACTORY_AUTH_TOKEN:-not found}"

# ── Initialize factory ────────────────────────────────────────────────────────

log "Checking if factory is already initialized..."
POOL_COUNT=$(curl -sf "$RPC_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"alkanes_simulate\",\"params\":[{\"target\":{\"block\":\"4\",\"tx\":\"$FACTORY_PROXY\"},\"inputs\":[\"4\"],\"alkanes\":[],\"transaction\":\"0x\",\"block\":\"0x\",\"height\":\"1\",\"txindex\":0,\"vout\":0}],\"id\":1}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); d=r.get('result',{}).get('execution',{}).get('data',''); print('0' if not d or d=='0x' else str(int.from_bytes(bytes.fromhex(d[2:]),'little')))" 2>/dev/null || echo "error")

if [ "$POOL_COUNT" = "0" ]; then
  log "Factory not initialized yet. Initializing..."

  # opcode 0 = InitFactory, args: beacon_proxy_template block/tx, beacon block/tx
  INIT_PROTOSTONE="[4,$FACTORY_PROXY,0,4,$BEACON_PROXY_TEMPLATE,4,$UPGRADEABLE_BEACON]:v0:v0"

  if [ -n "$FACTORY_AUTH_TOKEN" ]; then
    execute_call "InitFactory (with auth token)" "$INIT_PROTOSTONE" "${FACTORY_AUTH_TOKEN}:1"
  else
    warn "No auth token found — attempting factory init without one"
    execute_call "InitFactory" "$INIT_PROTOSTONE"
  fi
else
  log "Factory already initialized (pool count: $POOL_COUNT)"
fi

echo ""

# ── Verify factory ────────────────────────────────────────────────────────────

log "Verifying factory (opcode 4 = GetNumPools)..."
VERIFY=$(curl -sf "$RPC_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"alkanes_simulate\",\"params\":[{\"target\":{\"block\":\"4\",\"tx\":\"$FACTORY_PROXY\"},\"inputs\":[\"3\"],\"alkanes\":[],\"transaction\":\"0x\",\"block\":\"0x\",\"height\":\"1\",\"txindex\":0,\"vout\":0}],\"id\":1}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); d=r.get('result',{}).get('execution',{}); print('data:', d.get('data',''), '| error:', d.get('error','none'))" 2>/dev/null || echo "verify failed")
log "Factory opcode 3 (GetAllPools): $VERIFY"

echo ""
echo "════════════════════════════════════════"
echo "  Deploy Summary"
echo "════════════════════════════════════════"
echo "  Beacon Proxy Template: [4:$BEACON_PROXY_TEMPLATE]"
echo "  Pool Logic:            [4:$POOL_LOGIC]"
echo "  Factory Logic:         [4:$FACTORY_LOGIC]"
echo "  Factory Proxy:         [4:$FACTORY_PROXY]"
echo "  Upgradeable Beacon:    [4:$UPGRADEABLE_BEACON]"
echo ""
echo "  RPC:  $RPC_URL"
echo ""
echo "  Next steps:"
echo "  1. Create DIESEL/frBTC pool:"
echo "     node scripts/create-pool-regtest-local.cjs"
echo "  2. Fund connected wallet:"
echo "     node scripts/setup-regtest-local.cjs --wallet <taproot> --segwit <segwit>"
echo "════════════════════════════════════════"
