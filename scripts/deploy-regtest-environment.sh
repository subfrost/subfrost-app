#!/bin/bash

################################################################################
# Subfrost Regtest Environment Setup with Alkanes Integration
# 
# This script sets up a complete regtest testing environment including:
# - Bitcoin Core regtest node
# - Alkanes SDK build and linking
# - Next.js development server
# - Funded test addresses
# - Alkanes wallet integration
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BITCOIN_RPC_PORT=18443
BITCOIN_RPC_USER="user"
BITCOIN_RPC_PASSWORD="pass"
ALKANES_SDK_PATH="/Users/erickdelgado/Documents/github/alkanes-rs/ts-sdk"
SUBFROST_APP_PATH="/Users/erickdelgado/Documents/github/subfrost-appx"

################################################################################
# Helper Functions
################################################################################

print_header() {
  echo ""
  echo -e "${BLUE}=========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}=========================================${NC}"
  echo ""
}

print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
  echo -e "${RED}❌ $1${NC}"
}

print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check if Bitcoin Core is running
bitcoin_running() {
  bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD getblockcount >/dev/null 2>&1
}

################################################################################
# Step 1: Dependency Check
################################################################################

check_dependencies() {
  print_header "Step 1: Checking Dependencies"
  
  local missing_deps=()
  
  # Check Bitcoin Core
  if ! command_exists bitcoin-cli || ! command_exists bitcoind; then
    missing_deps+=("Bitcoin Core (bitcoind, bitcoin-cli)")
  fi
  
  # Check Node.js
  if ! command_exists node; then
    missing_deps+=("Node.js")
  fi
  
  # Check npm
  if ! command_exists npm; then
    missing_deps+=("npm")
  fi
  
  # Check wasm-pack
  if ! command_exists wasm-pack; then
    missing_deps+=("wasm-pack (cargo install wasm-pack)")
  fi
  
  if [ ${#missing_deps[@]} -ne 0 ]; then
    print_error "Missing dependencies:"
    for dep in "${missing_deps[@]}"; do
      echo "  - $dep"
    done
    echo ""
    print_info "Install missing dependencies and run again"
    exit 1
  fi
  
  print_success "All dependencies installed"
  print_info "Node version: $(node --version)"
  print_info "npm version: $(npm --version)"
  print_info "Bitcoin Core version: $(bitcoin-cli --version | head -1)"
}

################################################################################
# Step 2: Build Alkanes SDK
################################################################################

build_alkanes_sdk() {
  print_header "Step 2: Building Alkanes SDK"
  
  if [ ! -d "$ALKANES_SDK_PATH" ]; then
    print_error "Alkanes SDK not found at: $ALKANES_SDK_PATH"
    exit 1
  fi
  
  cd "$ALKANES_SDK_PATH"
  
  # Check if WASM is built
  if [ ! -d "wasm-pkg" ]; then
    print_info "WASM not found. Building..."
    npm run build:wasm
    print_success "WASM built"
  else
    print_success "WASM already built"
  fi
  
  # Build TypeScript
  print_info "Building TypeScript SDK..."
  npx tsup src/index.ts --format cjs,esm --dts --clean
  
  if [ $? -eq 0 ]; then
    print_success "TypeScript SDK built"
  else
    print_error "TypeScript build failed"
    exit 1
  fi
  
  # Link globally
  print_info "Linking @alkanes/ts-sdk globally..."
  npm link
  
  if [ $? -eq 0 ]; then
    print_success "@alkanes/ts-sdk linked globally"
  else
    print_error "npm link failed"
    exit 1
  fi
}

################################################################################
# Step 3: Link Alkanes SDK to Subfrost App
################################################################################

link_alkanes_to_app() {
  print_header "Step 3: Linking Alkanes SDK to Subfrost App"
  
  cd "$SUBFROST_APP_PATH"
  
  print_info "Linking @alkanes/ts-sdk to subfrost-appx..."
  npm link @alkanes/ts-sdk
  
  if [ $? -eq 0 ]; then
    print_success "@alkanes/ts-sdk linked to subfrost-appx"
  else
    print_error "Failed to link to subfrost-appx"
    exit 1
  fi
}

################################################################################
# Step 4: Setup Bitcoin Core Regtest
################################################################################

setup_bitcoin_regtest() {
  print_header "Step 4: Setting up Bitcoin Core Regtest"
  
  # Check if already running
  if bitcoin_running; then
    print_warning "Bitcoin Core regtest already running"
    local block_count=$(bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD getblockcount)
    print_info "Current block height: $block_count"
    
    read -p "Continue with existing node? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      print_info "Stopping Bitcoin Core..."
      bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD stop
      sleep 5
    else
      return 0
    fi
  fi
  
  # Start Bitcoin Core
  print_info "Starting Bitcoin Core in regtest mode..."
  bitcoind -regtest -daemon \
    -rpcuser=$BITCOIN_RPC_USER \
    -rpcpassword=$BITCOIN_RPC_PASSWORD \
    -rpcport=$BITCOIN_RPC_PORT \
    -fallbackfee=0.00001 \
    -txindex=1
  
  # Wait for startup
  print_info "Waiting for Bitcoin Core to start..."
  for i in {1..30}; do
    if bitcoin_running; then
      print_success "Bitcoin Core started"
      break
    fi
    sleep 1
  done
  
  if ! bitcoin_running; then
    print_error "Failed to start Bitcoin Core"
    exit 1
  fi
  
  # Create or load wallet
  print_info "Setting up wallet..."
  bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD createwallet "test" 2>/dev/null || true
  bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD loadwallet "test" 2>/dev/null || true
  
  # Check block count
  local block_count=$(bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD getblockcount)
  
  if [ "$block_count" -lt 101 ]; then
    print_info "Generating initial blocks (need 101 for coinbase maturity)..."
    local address=$(bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD getnewaddress)
    bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD generatetoaddress 101 "$address" >/dev/null
    print_success "Generated 101 blocks"
  else
    print_success "Already have $block_count blocks"
  fi
}

################################################################################
# Step 5: Create Test Addresses and Fund Them
################################################################################

fund_test_addresses() {
  print_header "Step 5: Creating and Funding Test Addresses"
  
  # Get a test address from Bitcoin Core
  local funding_address=$(bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD getnewaddress)
  
  print_info "Funding address: $funding_address"
  
  # Send some test BTC
  local txid=$(bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD sendtoaddress "$funding_address" 10.0)
  print_info "Sent 10 BTC (txid: ${txid:0:16}...)"
  
  # Mine block to confirm
  local mine_address=$(bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD getnewaddress)
  bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD generatetoaddress 1 "$mine_address" >/dev/null
  
  # Check balance
  local balance=$(bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD getbalance)
  print_success "Wallet balance: $balance BTC"
  
  # Save address for later use
  echo "$funding_address" > /tmp/subfrost-test-address.txt
}

################################################################################
# Step 6: Setup Environment Variables
################################################################################

setup_environment() {
  print_header "Step 6: Setting up Environment Variables"
  
  cd "$SUBFROST_APP_PATH"
  
  # Create .env.local if it doesn't exist
  if [ ! -f ".env.local" ]; then
    print_info "Creating .env.local..."
    cat > .env.local <<EOF
# Bitcoin Regtest Configuration
NEXT_PUBLIC_NETWORK=regtest
NEXT_PUBLIC_BITCOIN_RPC_URL=http://localhost:$BITCOIN_RPC_PORT
NEXT_PUBLIC_BITCOIN_RPC_USER=$BITCOIN_RPC_USER
NEXT_PUBLIC_BITCOIN_RPC_PASSWORD=$BITCOIN_RPC_PASSWORD

# Alkanes Configuration
NEXT_PUBLIC_ALKANES_ENABLED=true
NEXT_PUBLIC_ALKANES_API_URL=http://localhost:$BITCOIN_RPC_PORT
EOF
    print_success ".env.local created"
  else
    print_warning ".env.local already exists"
    print_info "Make sure NEXT_PUBLIC_NETWORK=regtest is set"
  fi
  
  print_success "Environment configured for regtest"
}

################################################################################
# Step 7: Install Dependencies
################################################################################

install_dependencies() {
  print_header "Step 7: Installing App Dependencies"
  
  cd "$SUBFROST_APP_PATH"
  
  if [ ! -d "node_modules" ]; then
    print_info "Installing npm packages..."
    npm install
    print_success "Dependencies installed"
  else
    print_success "Dependencies already installed"
  fi
}

################################################################################
# Step 8: Start Development Server
################################################################################

start_dev_server() {
  print_header "Step 8: Starting Development Server"
  
  cd "$SUBFROST_APP_PATH"
  
  print_info "Starting Next.js development server..."
  print_info "Access the app at: http://localhost:3000"
  print_info "Wallet test page: http://localhost:3000/wallet-test"
  echo ""
  print_warning "Press Ctrl+C to stop the dev server"
  echo ""
  
  npm run dev
}

################################################################################
# Cleanup Function
################################################################################

cleanup() {
  print_header "Cleanup"
  
  read -p "Stop Bitcoin Core regtest? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Stopping Bitcoin Core..."
    bitcoin-cli -regtest -rpcuser=$BITCOIN_RPC_USER -rpcpassword=$BITCOIN_RPC_PASSWORD stop 2>/dev/null || true
    print_success "Bitcoin Core stopped"
  fi
}

################################################################################
# Main Execution
################################################################################

main() {
  print_header "Subfrost Regtest Environment Setup"
  print_info "This script will:"
  echo "  1. Check dependencies"
  echo "  2. Build Alkanes SDK"
  echo "  3. Link Alkanes SDK to subfrost-app"
  echo "  4. Setup Bitcoin Core regtest node"
  echo "  5. Fund test addresses"
  echo "  6. Configure environment variables"
  echo "  7. Install app dependencies"
  echo "  8. Start development server"
  echo ""
  
  read -p "Continue? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Aborted by user"
    exit 0
  fi
  
  # Execute steps
  check_dependencies
  build_alkanes_sdk
  link_alkanes_to_app
  setup_bitcoin_regtest
  fund_test_addresses
  setup_environment
  install_dependencies
  
  # Summary
  print_header "Setup Complete!"
  echo ""
  echo -e "${GREEN}✅ Bitcoin Core regtest running${NC}"
  echo -e "${GREEN}✅ Alkanes SDK built and linked${NC}"
  echo -e "${GREEN}✅ Environment configured${NC}"
  echo -e "${GREEN}✅ Test addresses funded${NC}"
  echo ""
  print_info "Starting development server..."
  echo ""
  
  # Start dev server (blocks until Ctrl+C)
  start_dev_server
  
  # Cleanup on exit
  trap cleanup EXIT
}

# Run if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
