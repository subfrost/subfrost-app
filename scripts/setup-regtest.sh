#!/bin/bash

# Subfrost Regtest Environment Setup Script
# This script sets up a complete local regtest environment with alkanes-rs

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect the project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        Subfrost Regtest Environment Setup                      ║"
echo "║        Using alkanes-rs (kungfuflex/develop)                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Check prerequisites
info "Step 1/7: Checking prerequisites..."

if ! command_exists docker; then
    error "Docker is not installed. Please install Docker first."
    echo "  Visit: https://docs.docker.com/get-docker/"
    exit 1
fi
success "Docker is installed"

if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
    error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi
success "Docker Compose is installed"

if ! command_exists cargo; then
    error "Rust/Cargo is not installed. Please install Rust first."
    echo "  Run: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi
success "Rust/Cargo is installed"

if ! command_exists node; then
    error "Node.js is not installed. Please install Node.js first."
    echo "  Visit: https://nodejs.org/"
    exit 1
fi
success "Node.js is installed"

# Step 2: Check for required repositories
info "Step 2/7: Checking required repositories..."

ALKANES_RS_DIR="$PROJECT_ROOT/reference/alkanes-rs"
ALKANES_DOCKER_DIR="$PROJECT_ROOT/reference/alkanes"

if [ ! -d "$ALKANES_RS_DIR" ]; then
    error "alkanes-rs repository not found at $ALKANES_RS_DIR"
    info "Please clone it first: git clone https://github.com/kungfuflex/alkanes-rs reference/alkanes-rs"
    exit 1
fi
success "Found alkanes-rs repository"

if [ ! -d "$ALKANES_DOCKER_DIR" ]; then
    error "alkanes docker-compose repository not found at $ALKANES_DOCKER_DIR"
    info "Please clone it first: git clone https://github.com/kungfuflex/alkanes reference/alkanes"
    exit 1
fi
success "Found alkanes docker-compose repository"

# Step 3: Ensure we're on the correct branch
info "Step 3/7: Checking out kungfuflex/develop branch..."

cd "$ALKANES_RS_DIR"
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "kungfuflex/develop" ]; then
    info "Switching to kungfuflex/develop branch..."
    git fetch origin
    git checkout kungfuflex/develop
    success "Switched to kungfuflex/develop"
else
    success "Already on kungfuflex/develop"
fi

# Step 4: Build alkanes indexer
info "Step 4/7: Building alkanes indexer (this may take a while)..."

cd "$ALKANES_RS_DIR"

# Add wasm32-unknown-unknown target if not present
if ! rustup target list | grep -q "wasm32-unknown-unknown (installed)"; then
    info "Adding wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
fi

info "Building alkanes.wasm with regtest features..."
cargo build --release --features regtest --target wasm32-unknown-unknown

WASM_OUTPUT="$ALKANES_RS_DIR/target/wasm32-unknown-unknown/release/alkanes.wasm"
if [ ! -f "$WASM_OUTPUT" ]; then
    error "Build failed: alkanes.wasm not found at $WASM_OUTPUT"
    exit 1
fi
success "Built alkanes.wasm successfully"

# Step 5: Copy WASM binary to docker directory
info "Step 5/7: Copying alkanes.wasm to docker-compose directory..."

METASHREW_DIR="$ALKANES_DOCKER_DIR/docker/metashrew"
mkdir -p "$METASHREW_DIR"
cp "$WASM_OUTPUT" "$METASHREW_DIR/alkanes.wasm"
success "Copied alkanes.wasm to $METASHREW_DIR"

# Step 6: Start docker-compose environment
info "Step 6/7: Starting docker-compose environment..."

cd "$ALKANES_DOCKER_DIR"

# Stop any existing containers
if docker-compose ps -q 2>/dev/null | grep -q .; then
    warning "Stopping existing containers..."
    docker-compose down
fi

info "Starting all services (bitcoind, metashrew, memshrew, jsonrpc, ord, esplora, espo)..."
docker-compose up -d

# Wait for services to be ready
info "Waiting for services to start (15 seconds)..."
sleep 15

# Check if services are running
if ! docker-compose ps | grep -q "Up"; then
    error "Some services failed to start. Check logs with: docker-compose logs"
    exit 1
fi
success "All services are running"

# Step 7: Initialize Bitcoin regtest chain
info "Step 7/7: Initializing Bitcoin regtest chain..."

# Wait a bit more for bitcoind to be fully ready
sleep 5

# Create wallet
info "Creating Bitcoin wallet..."
docker-compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc createwallet "test" 2>/dev/null || true

# Mine initial blocks
info "Mining 101 blocks (required for coinbase maturity)..."
ADDRESS=$(docker-compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc getnewaddress | tr -d '\r')
docker-compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc generatetoaddress 101 "$ADDRESS" >/dev/null

# Verify
BLOCK_COUNT=$(docker-compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc getblockcount | tr -d '\r')
success "Mined 101 blocks. Current height: $BLOCK_COUNT"

# Step 8: Create .env.local if it doesn't exist
info "Setting up environment configuration..."

ENV_FILE="$PROJECT_ROOT/.env.local"
if [ ! -f "$ENV_FILE" ]; then
    cat > "$ENV_FILE" << 'EOF'
# Network Configuration
NEXT_PUBLIC_NETWORK=regtest

# Bitcoin RPC (via docker-compose)
BITCOIN_RPC_URL=http://127.0.0.1:18443
BITCOIN_RPC_USER=bitcoinrpc
BITCOIN_RPC_PASSWORD=bitcoinrpc

# Alkanes JSON-RPC API
NEXT_PUBLIC_ALKANES_RPC_URL=http://localhost:18888

# Esplora API
NEXT_PUBLIC_ESPLORA_URL=http://localhost:50010

# Espo API
NEXT_PUBLIC_ESPO_URL=http://localhost:9069
EOF
    success "Created .env.local with regtest configuration"
else
    warning ".env.local already exists - skipping creation"
fi

# Final summary
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    Setup Complete! ✓                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
success "Regtest environment is ready!"
echo ""
echo "Services running:"
echo "  • Bitcoin RPC:      http://localhost:18443"
echo "  • Alkanes JSON-RPC: http://localhost:18888"
echo "  • Esplora API:      http://localhost:50010"
echo "  • Espo API:         http://localhost:9069"
echo ""
echo "Next steps:"
echo ""
echo "  1. Start the Subfrost app:"
echo "     ${GREEN}npm run dev:regtest${NC}"
echo ""
echo "  2. Open your browser:"
echo "     ${GREEN}http://localhost:3003${NC}"
echo ""
echo "  3. Mine blocks as needed:"
echo "     ${GREEN}cd reference/alkanes && docker-compose exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc generatetoaddress 6 \$(docker-compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc getnewaddress | tr -d '\\r')${NC}"
echo ""
echo "Useful commands:"
echo ""
echo "  View logs:      ${BLUE}cd reference/alkanes && docker-compose logs -f${NC}"
echo "  Stop services:  ${BLUE}cd reference/alkanes && docker-compose down${NC}"
echo "  Restart:        ${BLUE}cd reference/alkanes && docker-compose restart${NC}"
echo "  Reset all data: ${BLUE}cd reference/alkanes && docker-compose down -v${NC}"
echo ""
echo "Documentation: ${BLUE}docs/REGTEST_ALKANES_SETUP.md${NC}"
echo ""
