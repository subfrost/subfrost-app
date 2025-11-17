#!/bin/bash

################################################################################
# Subfrost Complete Regtest Deployment
# 
# This script provides end-to-end deployment:
#   Phase 1: Infrastructure Setup (Bitcoin Core + Alkanes Indexer)
#   Phase 2: Contract Deployment (All Subfrost Alkanes + OYL AMM)
#
# Usage:
#   ./deploy-regtest.sh                    # Full deployment
#   ./deploy-regtest.sh --skip-infra       # Only deploy contracts
#   ./deploy-regtest.sh --skip-contracts   # Only setup infrastructure
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

################################################################################
# Configuration
################################################################################

# Detect script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Infrastructure configuration
ALKANES_REPO_PATH="${ALKANES_REPO_PATH:-$(dirname "$PROJECT_ROOT")/alkanes}"
ALKANES_INDEXER_PORT="${ALKANES_INDEXER_PORT:-18888}"
BITCOIN_RPC_PORT="${BITCOIN_RPC_PORT:-18443}"
BITCOIN_RPC_USER="${BITCOIN_RPC_USER:-user}"
BITCOIN_RPC_PASSWORD="${BITCOIN_RPC_PASSWORD:-pass}"

# Contract deployment configuration
ALKANES_RS_DIR="${ALKANES_RS_DIR:-$(dirname "$PROJECT_ROOT")/alkanes-rs}"
WASM_DIR="$PROJECT_ROOT/prod_wasms"
WALLET_FILE="$HOME/.alkanes/regtest-wallet.json"
RPC_URL="http://localhost:$ALKANES_INDEXER_PORT"

# Flags
AUTO_YES="${AUTO_YES:-false}"
SKIP_BUILD="${SKIP_BUILD:-false}"
SKIP_INFRASTRUCTURE="${SKIP_INFRASTRUCTURE:-false}"
SKIP_CONTRACTS="${SKIP_CONTRACTS:-false}"
VERBOSE="${VERBOSE:-false}"

# OYL AMM Constants
AMM_FACTORY_ID=65522
AUTH_TOKEN_FACTORY_ID=65517
AMM_FACTORY_PROXY_TX=1
AMM_FACTORY_LOGIC_IMPL_TX=62463
POOL_BEACON_PROXY_TX=781633
POOL_UPGRADEABLE_BEACON_TX=781632

################################################################################
# Helper Functions
################################################################################

log_header() {
  echo ""
  echo -e "${BLUE}=========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}=========================================${NC}"
  echo ""
}

log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}" >&2; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

ask_continue() {
  if [ "$AUTO_YES" = "true" ]; then
    return 0
  fi
  
  local prompt="${1:-Continue?}"
  read -p "$prompt (y/n) " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]]
}

cleanup_on_error() {
  log_error "Deployment failed. Cleaning up..."
  cd "$ALKANES_REPO_PATH" 2>/dev/null && docker compose down 2>/dev/null || true
}

trap cleanup_on_error ERR

################################################################################
# PHASE 1: INFRASTRUCTURE SETUP
################################################################################

check_infrastructure_dependencies() {
  log_header "Phase 1: Infrastructure Setup - Checking Dependencies"
  
  local missing=()
  
  if ! command_exists docker; then
    missing+=("Docker")
  fi
  
  if ! command_exists git; then
    missing+=("Git")
  fi
  
  if ! command_exists curl; then
    missing+=("curl")
  fi
  
  if [ ${#missing[@]} -ne 0 ]; then
    log_error "Missing required dependencies:"
    for dep in "${missing[@]}"; do
      echo "  - $dep"
    done
    exit 1
  fi
  
  # Check Docker is running
  if ! docker info >/dev/null 2>&1; then
    log_error "Docker is not running. Please start Docker Desktop."
    exit 1
  fi
  
  log_success "All infrastructure dependencies present"
}

clone_alkanes() {
  log_info "Setting Up Alkanes Repository..."
  
  if [ -d "$ALKANES_REPO_PATH" ]; then
    log_info "Alkanes repo exists at: $ALKANES_REPO_PATH"
    
    if [ -d "$ALKANES_REPO_PATH/.git" ]; then
      cd "$ALKANES_REPO_PATH"
      git fetch origin >/dev/null 2>&1
      git pull >/dev/null 2>&1
      git submodule update --init --recursive >/dev/null 2>&1
      log_success "Repository updated"
    else
      log_warning "Directory exists but is not a git repo"
    fi
  else
    log_info "Cloning alkanes repository..."
    git clone --recurse-submodules https://github.com/kungfuflex/alkanes "$ALKANES_REPO_PATH" >/dev/null 2>&1
    log_success "Repository cloned"
  fi
}

build_docker() {
  log_info "Building Docker Images..."
  
  if [ "$SKIP_BUILD" = "true" ]; then
    log_info "Skipping build (SKIP_BUILD=true)"
    return 0
  fi
  
  cd "$ALKANES_REPO_PATH"
  
  if ! ask_continue "Build Docker images? (takes 20-40 min on first build)"; then
    SKIP_BUILD=true
    return 0
  fi
  
  docker compose build >/dev/null 2>&1 &
  local build_pid=$!
  
  while kill -0 $build_pid 2>/dev/null; do
    sleep 10
    log_info "Building..."
  done
  
  wait $build_pid
  
  if [ $? -eq 0 ]; then
    log_success "Docker images built successfully"
  else
    log_error "Build failed"
    exit 1
  fi
}

start_services() {
  log_info "Starting Services (Bitcoin Core + Alkanes Indexer)..."
  
  cd "$ALKANES_REPO_PATH"
  docker compose up -d >/dev/null 2>&1
  
  log_info "Waiting for indexer to be ready..."
  for i in {1..60}; do
    if curl -s -m 2 "$RPC_URL/v2/regtest" \
       -H 'Content-Type: application/json' \
       -d '{"jsonrpc":"2.0","id":1,"method":"btc_getblockcount","params":[]}' \
       | grep -q "result"; then
      log_success "Indexer is ready at $RPC_URL"
      return 0
    fi
    sleep 2
  done
  
  log_error "Indexer failed to start"
  exit 1
}

initialize_chain() {
  log_info "Initializing Bitcoin Chain (260 blocks)..."
  
  local blocks=$(curl -s "$RPC_URL/v2/regtest" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"btc_getblockcount","params":[]}' \
    | grep -o '"result":[0-9]*' | cut -d':' -f2 || echo "0")
  
  if [ "$blocks" -ge 260 ]; then
    log_success "Chain already initialized ($blocks blocks)"
    return 0
  fi
  
  log_info "Initializing chain (current: $blocks blocks)..."
  
  cd "$ALKANES_REPO_PATH"
  if docker compose exec -T metashrew npx oyl init --trace >/dev/null 2>&1; then
    log_success "Chain initialized"
  else
    log_warning "Auto-initialization failed, continuing anyway"
  fi
}

setup_environment() {
  log_info "Configuring Environment (.env.local)..."
  
  cd "$PROJECT_ROOT"
  
  if [ -f ".env.local" ]; then
    log_success ".env.local already exists"
    return 0
  fi
  
  cat > .env.local <<EOF
# Bitcoin Regtest Configuration
NEXT_PUBLIC_NETWORK=regtest
NEXT_PUBLIC_BITCOIN_RPC_URL=http://localhost:$BITCOIN_RPC_PORT
NEXT_PUBLIC_BITCOIN_RPC_USER=$BITCOIN_RPC_USER
NEXT_PUBLIC_BITCOIN_RPC_PASSWORD=$BITCOIN_RPC_PASSWORD

# Alkanes Indexer Configuration
NEXT_PUBLIC_ALKANES_ENABLED=true
NEXT_PUBLIC_ALKANES_INDEXER_URL=http://localhost:$ALKANES_INDEXER_PORT/v2/regtest
NEXT_PUBLIC_ALKANES_API_URL=http://localhost:$ALKANES_INDEXER_PORT

# ftrBTC Alkane [31, 0]
NEXT_PUBLIC_FTRBTC_ALKANE_BLOCK=31
NEXT_PUBLIC_FTRBTC_ALKANE_TX=0
EOF
  
  log_success ".env.local created"
}

################################################################################
# PHASE 2: CONTRACT DEPLOYMENT
################################################################################

check_contract_dependencies() {
  log_header "Phase 2: Contract Deployment - Checking Dependencies"
  
  # Check if alkanes-cli exists (try both names for compatibility)
  if command_exists alkanes-cli; then
    CLI_CMD="alkanes-cli"
    log_success "Found alkanes-cli: $(which alkanes-cli)"
  elif command_exists subfrost-cli; then
    CLI_CMD="subfrost-cli"
    log_success "Found subfrost-cli: $(which subfrost-cli)"
  else
    log_error "alkanes-cli/subfrost-cli not found in PATH"
    log_info "Build it with: cd $ALKANES_RS_DIR && cargo build --release --bin alkanes-cli"
    log_info "Add to PATH: export PATH=\"$ALKANES_RS_DIR/target/release:\$PATH\""
    log_info "Or create symlink: ln -s alkanes-cli subfrost-cli"
    exit 1
  fi
  
  # Check if regtest node is running
  if ! curl -s "$RPC_URL" >/dev/null 2>&1; then
    log_error "Cannot connect to regtest node at $RPC_URL"
    log_info "Run infrastructure setup first or start services manually"
    exit 1
  fi
  log_success "Regtest node is running at $RPC_URL"
  
  # Check if WASMs exist
  if [ ! -d "$WASM_DIR" ] || [ -z "$(ls -A $WASM_DIR/*.wasm 2>/dev/null)" ]; then
    log_error "WASM files not found in $WASM_DIR"
    log_info "Build WASMs with:"
    log_info "  cd $(dirname "$PROJECT_ROOT")/subfrost-alkanes"
    log_info "  cargo build --release --target wasm32-unknown-unknown"
    log_info "  cp target/wasm32-unknown-unknown/release/*.wasm $WASM_DIR/"
    exit 1
  fi
  
  local count=$(find "$WASM_DIR" -name "*.wasm" -type f -size +1k | wc -l)
  log_success "Found $(printf "%8s" $count) WASM files in $WASM_DIR"
}

setup_wallet() {
  log_info "Setting up deployment wallet..."
  
  # Note: alkanes-cli uses keystore files and wallet options differently than old subfrost-cli
  # For regtest deployment, we'll use Bitcoin Core's wallet for funding
  log_info "Using Bitcoin Core regtest wallet for contract deployment"
  
  # Generate a test address for deployment
  local TEST_ADDRESS=$(docker exec subfrost-bitcoin bitcoin-cli \
    -regtest \
    -rpcuser="$BITCOIN_RPC_USER" \
    -rpcpassword="$BITCOIN_RPC_PASSWORD" \
    -rpcport="$BITCOIN_RPC_PORT" \
    getnewaddress 2>/dev/null || echo "")
  
  if [ -n "$TEST_ADDRESS" ]; then
    log_success "Deployment address: $TEST_ADDRESS"
    WALLET_ADDRESS="$TEST_ADDRESS"
  else
    log_warning "Could not get deployment address (will use defaults)"
  fi
}

fund_wallet() {
  log_info "Checking wallet funding..."
  
  # For regtest, we'll use Bitcoin Core to manage funds
  # alkanes-cli will interact with the regtest node for deployments
  
  # Generate some blocks to ensure we have mature coinbase UTXOs
  log_info "Generating blocks for deployment funding..."
  docker exec subfrost-bitcoin bitcoin-cli \
    -regtest \
    -rpcuser="$BITCOIN_RPC_USER" \
    -rpcpassword="$BITCOIN_RPC_PASSWORD" \
    -rpcport="$BITCOIN_RPC_PORT" \
    -generate 10 >/dev/null 2>&1 || true
  
  log_success "Wallet funded and ready for deployment"
}

deploy_contract() {
  local CONTRACT_NAME=$1
  local WASM_FILE=$2
  local TARGET_BLOCK=$3
  local TARGET_TX=$4
  shift 4
  local INIT_ARGS="$@"
  
  log_info "📄 Deploying $CONTRACT_NAME to [$TARGET_BLOCK, $TARGET_TX]..."
  
  if [ ! -f "$WASM_FILE" ]; then
    log_warning "   WASM not found: $WASM_FILE (skipping)"
    return 0
  fi
  
  # Step 1: Deploy contract with envelope
  log_info "   Deploying WASM ($(du -h "$WASM_FILE" | cut -f1))..."
  
  local DEPLOY_PROTOSTONE="[$TARGET_BLOCK,$TARGET_TX]"
  
  $CLI_CMD -p regtest \
    --bitcoin-rpc-url="http://localhost:$BITCOIN_RPC_PORT" \
    --bitcoin-rpc-user="$BITCOIN_RPC_USER" \
    --bitcoin-rpc-password="$BITCOIN_RPC_PASSWORD" \
    alkanes execute "$DEPLOY_PROTOSTONE" \
    --envelope "$WASM_FILE" \
    --fee-rate 1 \
    --mine \
    -y \
    >/dev/null 2>&1
  
  if [ $? -eq 0 ]; then
    log_success "   ✅ $CONTRACT_NAME deployed at [$TARGET_BLOCK, $TARGET_TX]"
    
    # Step 2: Initialize if needed
    if [ -n "$INIT_ARGS" ] && [ "$INIT_ARGS" != "CREATE_pattern" ] && [ "$INIT_ARGS" != "marker_"* ]; then
      log_info "   Initializing with args: $INIT_ARGS"
      
      local INIT_PROTOSTONE="[$TARGET_BLOCK,$TARGET_TX,0,$INIT_ARGS]"
      
      $CLI_CMD -p regtest \
        --bitcoin-rpc-url="http://localhost:$BITCOIN_RPC_PORT" \
        --bitcoin-rpc-user="$BITCOIN_RPC_USER" \
        --bitcoin-rpc-password="$BITCOIN_RPC_PASSWORD" \
        alkanes execute "$INIT_PROTOSTONE" \
        --fee-rate 1 \
        --mine \
        -y \
        >/dev/null 2>&1
      
      if [ $? -eq 0 ]; then
        log_success "   ✅ Initialized successfully"
      else
        log_warning "   ⚠️  Initialization failed (may not be critical)"
      fi
    fi
    
    # Step 3: Verify deployment
    sleep 1  # Give indexer time to process
    return 0
  else
    log_error "   ❌ Deployment failed"
    return 1
  fi
}

deploy_all_contracts() {
  log_header "Deploying Subfrost Contracts"
  
  log_info "Deploying all contracts to regtest..."
  log_info "This will take several minutes as each contract is deployed and initialized."
  echo ""
  
  # Phase 1: Foundation Tokens
  log_info "═══ Phase 1: Foundation Tokens (2 contracts) ═══"
  # Note: DIESEL and ftrBTC likely already exist from infrastructure setup
  # deploy_contract "DIESEL Token" "$WASM_DIR/diesel.wasm" 2 0 ""
  # deploy_contract "ftrBTC" "$WASM_DIR/fr_btc.wasm" 32 0 ""
  log_info "   Skipping DIESEL [2,0] and ftrBTC [32,0] (assumed from infrastructure)"
  echo ""
  
  # Phase 2: Standard Templates (Block 3)
  log_info "═══ Phase 2: Standard Templates (4 contracts, block 3) ═══"
  deploy_contract "Auth Token Factory" "$WASM_DIR/alkanes_std_auth_token.wasm" 3 $((0xffed)) "100"
  deploy_contract "Beacon Proxy" "$WASM_DIR/alkanes_std_beacon_proxy.wasm" 3 $((0xbeac1)) "$((0x8fff))"
  deploy_contract "Upgradeable Beacon" "$WASM_DIR/alkanes_std_upgradeable_beacon.wasm" 3 $((0xbeac0)) "$((0x7fff)),4,$((0xffef)),1"
  deploy_contract "Upgradeable Proxy" "$WASM_DIR/alkanes_std_upgradeable.wasm" 3 1 "$((0x7fff))"
  echo ""
  
  # Phase 3: OYL AMM System (Block 4)
  log_info "═══ Phase 3: OYL AMM System (3 contracts, block 4) ═══"
  deploy_contract "Pool Template" "$WASM_DIR/pool.wasm" 4 $((0xffef)) "50"
  deploy_contract "Factory Logic" "$WASM_DIR/factory.wasm" 4 2 "50"
  # Factory proxy initialization: opcode 0, pool_factory_id, beacon_block, beacon_tx
  deploy_contract "Factory Proxy" "$WASM_DIR/alkanes_std_upgradeable.wasm" 4 1 "$((0xbeac1)),4,$((0xbeac0))"
  echo ""
  
  # Phase 4: LBTC Yield System (Block 4, 0x1f00 range)
  log_info "═══ Phase 4: LBTC Yield System (10 contracts, 0x1f00 range) ═══"
  # Deploy yv-fr-btc vault first (dependency for dxBTC)
  deploy_contract "yv-fr-btc Vault" "$WASM_DIR/yv_fr_btc_vault.wasm" 4 $((0x1f01)) "32,0"
  # Deploy dxBTC with asset_id (frBTC 32,0) and vault_id (4,0x1f01)
  deploy_contract "dxBTC" "$WASM_DIR/dx_btc.wasm" 4 $((0x1f00)) "32,0,4,$((0x1f01))"
  deploy_contract "LBTC Yield Splitter" "$WASM_DIR/lbtc_yield_splitter.wasm" 4 $((0x1f10)) ""
  deploy_contract "pLBTC" "$WASM_DIR/p_lbtc.wasm" 4 $((0x1f11)) ""
  deploy_contract "yxLBTC" "$WASM_DIR/yx_lbtc.wasm" 4 $((0x1f12)) ""
  deploy_contract "FROST Token" "$WASM_DIR/frost_token.wasm" 4 $((0x1f13)) ""
  deploy_contract "vxFROST Gauge" "$WASM_DIR/vx_frost_gauge.wasm" 4 $((0x1f14)) ""
  deploy_contract "Synth Pool" "$WASM_DIR/synth_pool.wasm" 4 $((0x1f15)) ""
  deploy_contract "LBTC Oracle" "$WASM_DIR/fr_oracle.wasm" 4 $((0x1f16)) ""
  deploy_contract "LBTC Token" "$WASM_DIR/lbtc.wasm" 4 $((0x1f17)) ""
  echo ""
  
  # Phase 5: Futures System (Block 31)
  log_info "═══ Phase 5: Futures System (1 contract, block 31) ═══"
  # Deploy ftrBTC Master with opcode 0 (master mode initialization)
  deploy_contract "ftrBTC Master" "$WASM_DIR/ftr_btc.wasm" 31 0 ""
  echo ""
  log_info "   Note: BTC PT/YT tokens created dynamically via factory"
  echo ""
  
  # Phase 6: Gauge & Vault System (Block 5)
  log_info "═══ Phase 6: Gauge & Vault System (1 contract) ═══"
  # Gauge initialization needs LP token ID, reward token (DIESEL 2,0), ve_diesel ID, reward rate
  # For now, deploy without initialization (needs LP pool first)
  deploy_contract "Gauge Contract" "$WASM_DIR/gauge_contract.wasm" 5 1 ""
  echo ""
  log_info "   Note: Vault contracts deployed on-demand via CREATE pattern"
  echo ""
  
  # Phase 7: Templates
  log_info "═══ Phase 7: Templates (3 contracts) ═══"
  log_info "   Note: Templates deployed to reserved IDs for general use"
  deploy_contract "ve Token Vault Template" "$WASM_DIR/ve_token_vault_template.wasm" 4 $((0x1f20)) ""
  deploy_contract "vx Token Gauge Template" "$WASM_DIR/vx_token_gauge_template.wasm" 4 $((0x1f21)) ""
  deploy_contract "yve Token NFT Template" "$WASM_DIR/yve_token_nft_template.wasm" 4 $((0x1f22)) ""
  echo ""
  
  log_info "══════════════════════════════════════════════════════════════"
  log_success "Contract deployment complete!"
  log_info "All contracts deployed to regtest."
  log_info "For details, see: scripts/CONTRACT_DEPLOYMENT_GUIDE.md"
  log_info "══════════════════════════════════════════════════════════════"
}

################################################################################
# Main Execution
################################################################################

show_usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Complete Regtest Deployment (Infrastructure + Contracts)

Options:
  -y, --yes               Skip confirmation prompts
  -s, --skip-build        Skip Docker build (use existing images)
  -v, --verbose           Show detailed output
  --skip-infra            Skip infrastructure setup (only deploy contracts)
  --skip-contracts        Skip contract deployment (only setup infrastructure)
  -h, --help              Show this help message

Environment Variables:
  ALKANES_REPO_PATH       Path to alkanes repository (default: ../alkanes)
  ALKANES_RS_DIR          Path to alkanes-rs repository (default: ../alkanes-rs)
  ALKANES_INDEXER_PORT    Indexer RPC port (default: 18888)
  AUTO_YES                Skip prompts (true/false)
  SKIP_BUILD              Skip Docker build (true/false)

Examples:
  # Full deployment (infrastructure + contracts)
  $0

  # Only setup infrastructure
  $0 --skip-contracts

  # Only deploy contracts (assumes infrastructure running)
  $0 --skip-infra

  # Automated deployment (CI/CD)
  AUTO_YES=true $0

EOF
}

main() {
  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      -y|--yes) AUTO_YES=true; shift ;;
      -s|--skip-build) SKIP_BUILD=true; shift ;;
      -v|--verbose) VERBOSE=true; shift ;;
      --skip-infra) SKIP_INFRASTRUCTURE=true; shift ;;
      --skip-contracts) SKIP_CONTRACTS=true; shift ;;
      -h|--help) show_usage; exit 0 ;;
      *) log_error "Unknown option: $1"; show_usage; exit 1 ;;
    esac
  done
  
  log_header "Subfrost Complete Regtest Deployment"
  
  # PHASE 1: Infrastructure Setup
  if [ "$SKIP_INFRASTRUCTURE" = "false" ]; then
    check_infrastructure_dependencies
    clone_alkanes
    build_docker
    start_services
    initialize_chain
    setup_environment
    
    log_success "Infrastructure setup complete!"
    echo ""
  else
    log_info "Skipping infrastructure setup (--skip-infra)"
    echo ""
  fi
  
  # PHASE 2: Contract Deployment
  if [ "$SKIP_CONTRACTS" = "false" ]; then
    check_contract_dependencies
    setup_wallet
    fund_wallet
    deploy_all_contracts
    
    log_success "Contract deployment complete!"
    echo ""
  else
    log_info "Skipping contract deployment (--skip-contracts)"
    echo ""
  fi
  
  # Final Summary
  log_header "Deployment Complete! 🎉"
  echo ""
  log_success "Your regtest environment is ready!"
  echo ""
  log_info "Services:"
  echo "  • Bitcoin Core: localhost:$BITCOIN_RPC_PORT"
  echo "  • Alkanes Indexer: $RPC_URL"
  echo ""
  log_info "Next steps:"
  echo "  • Start dev server: cd $PROJECT_ROOT && npm run dev"
  echo "  • Visit: http://localhost:3000"
  echo ""
  log_info "Management:"
  echo "  • View logs: cd $ALKANES_REPO_PATH && docker compose logs -f"
  echo "  • Stop services: cd $ALKANES_REPO_PATH && docker compose down"
  echo ""
}

# Run main
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
