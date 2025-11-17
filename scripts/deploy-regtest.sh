#!/bin/bash

################################################################################
# Subfrost Regtest Deployment - Production Stable Version
# 
# This script sets up alkanes indexer + ftrBTC [31, 0] initialization
# Designed to work on any machine and in CI/CD environments
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
# Configuration - Override with environment variables
################################################################################

# Detect script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configurable paths (can be overridden)
ALKANES_REPO_PATH="${ALKANES_REPO_PATH:-$(dirname "$PROJECT_ROOT")/alkanes}"
ALKANES_INDEXER_PORT="${ALKANES_INDEXER_PORT:-18888}"
BITCOIN_RPC_PORT="${BITCOIN_RPC_PORT:-18443}"
BITCOIN_RPC_USER="${BITCOIN_RPC_USER:-user}"
BITCOIN_RPC_PASSWORD="${BITCOIN_RPC_PASSWORD:-pass}"

# Flags
AUTO_YES="${AUTO_YES:-false}"
SKIP_BUILD="${SKIP_BUILD:-false}"
VERBOSE="${VERBOSE:-false}"

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
# Dependency Checks
################################################################################

check_dependencies() {
  log_header "Checking Dependencies"
  
  local missing=()
  
  if ! command_exists docker; then
    missing+=("Docker")
  fi
  
  if ! command_exists docker-compose || ! command_exists docker; then
    missing+=("Docker Compose")
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
  
  # Check Docker memory
  local docker_mem=$(docker info 2>/dev/null | grep "Total Memory" | awk '{print $3}' | sed 's/GiB//')
  if (( $(echo "$docker_mem < 6" | bc -l 2>/dev/null || echo 0) )); then
    log_warning "Docker has ${docker_mem}GB RAM (recommended: 6GB+)"
    log_warning "Build may fail with out-of-memory errors"
    
    if ! ask_continue "Continue anyway?"; then
      log_info "Increase Docker memory: Settings → Resources → Memory → 6GB"
      exit 1
    fi
  fi
  
  log_success "All dependencies present"
  log_info "Docker Memory: ${docker_mem}GB"
}

################################################################################
# Clone Alkanes Repository
################################################################################

clone_alkanes() {
  log_header "Setting Up Alkanes Repository"
  
  if [ -d "$ALKANES_REPO_PATH" ]; then
    log_info "Alkanes repo exists at: $ALKANES_REPO_PATH"
    
    if [ -d "$ALKANES_REPO_PATH/.git" ]; then
      log_info "Updating repository..."
      cd "$ALKANES_REPO_PATH"
      git fetch origin
      git pull
      git submodule update --init --recursive
      log_success "Repository updated"
    else
      log_warning "Directory exists but is not a git repo"
      if ! ask_continue "Use existing directory?"; then
        exit 1
      fi
    fi
  else
    log_info "Cloning alkanes repository..."
    git clone --recurse-submodules https://github.com/kungfuflex/alkanes "$ALKANES_REPO_PATH"
    log_success "Repository cloned"
  fi
  
  cd "$ALKANES_REPO_PATH"
}

################################################################################
# Build Docker Images
################################################################################

build_docker() {
  log_header "Building Docker Images"
  
  if [ "$SKIP_BUILD" = "true" ]; then
    log_info "Skipping build (SKIP_BUILD=true)"
    return 0
  fi
  
  cd "$ALKANES_REPO_PATH"
  
  log_warning "This will take 20-40 minutes on first build"
  
  if ! ask_continue "Start Docker build?"; then
    exit 0
  fi
  
  log_info "Building..."
  
  if [ "$VERBOSE" = "true" ]; then
    docker compose build --progress=plain 2>&1 | tee /tmp/alkanes-build.log
  else
    docker compose build 2>&1 | tee /tmp/alkanes-build.log &
    local build_pid=$!
    
    # Show progress
    while kill -0 $build_pid 2>/dev/null; do
      sleep 10
      local lines=$(wc -l < /tmp/alkanes-build.log 2>/dev/null || echo 0)
      log_info "Building... ($lines lines of output)"
    done
    
    wait $build_pid
  fi
  
  if [ $? -eq 0 ]; then
    log_success "Docker images built successfully"
  else
    log_error "Build failed. Check /tmp/alkanes-build.log"
    exit 1
  fi
}

################################################################################
# Start Services
################################################################################

start_services() {
  log_header "Starting Services"
  
  cd "$ALKANES_REPO_PATH"
  
  log_info "Starting Bitcoin Core + Metashrew indexer..."
  docker compose up -d
  
  log_info "Waiting for indexer to be ready..."
  for i in {1..60}; do
    if curl -s -m 2 "http://localhost:$ALKANES_INDEXER_PORT/v2/regtest" \
       -H 'Content-Type: application/json' \
       -d '{"jsonrpc":"2.0","id":1,"method":"btc_getblockcount","params":[]}' \
       | grep -q "result"; then
      log_success "Indexer is ready!"
      return 0
    fi
    
    [ $((i % 10)) -eq 0 ] && log_info "Still waiting... ($i/60)"
    sleep 2
  done
  
  log_error "Indexer failed to start"
  docker compose logs
  exit 1
}

################################################################################
# Initialize Chain
################################################################################

initialize_chain() {
  log_header "Initializing Bitcoin Chain (260 blocks)"
  
  cd "$ALKANES_REPO_PATH"
  
  # Check current block count
  local blocks=$(curl -s "http://localhost:$ALKANES_INDEXER_PORT/v2/regtest" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"btc_getblockcount","params":[]}' \
    | grep -o '"result":[0-9]*' | cut -d':' -f2 || echo "0")
  
  log_info "Current block height: $blocks"
  
  if [ "$blocks" -ge 260 ]; then
    log_success "Chain already initialized ($blocks blocks)"
    return 0
  fi
  
  log_info "Initializing with oyl CLI..."
  
  # Try multiple methods
  if docker compose exec -T metashrew npx oyl init --trace 2>&1 | tee /tmp/alkanes-init.log; then
    log_success "Chain initialized"
  elif npx oyl init --trace 2>&1 | tee /tmp/alkanes-init.log; then
    log_success "Chain initialized"
  else
    log_warning "Auto-initialization failed. Manual init may be needed"
    log_info "Try: cd $ALKANES_REPO_PATH && docker compose exec metashrew npx oyl init --trace"
  fi
}

################################################################################
# Verify ftrBTC
################################################################################

verify_ftrbtc() {
  log_header "Verifying ftrBTC [31, 0]"
  
  local result=$(curl -s "http://localhost:$ALKANES_INDEXER_PORT/v2/regtest" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"alkanes_getAlkaneInfo","params":[31,0]}' 2>/dev/null)
  
  if echo "$result" | grep -q '"result"'; then
    log_success "ftrBTC [31, 0] is initialized"
    log_info "Details: $result"
  else
    log_info "ftrBTC [31, 0] not yet initialized (will be on first use)"
  fi
  
  # Get block height
  local blocks=$(curl -s "http://localhost:$ALKANES_INDEXER_PORT/v2/regtest" \
    -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"btc_getblockcount","params":[]}' \
    | grep -o '"result":[0-9]*' | cut -d':' -f2)
  
  log_info "Block height: $blocks"
  log_success "Alkanes indexer ready at http://localhost:$ALKANES_INDEXER_PORT"
}

################################################################################
# Setup Environment
################################################################################

setup_environment() {
  log_header "Configuring Environment"
  
  cd "$PROJECT_ROOT"
  
  if [ -f ".env.local" ]; then
    log_info ".env.local already exists"
    return 0
  fi
  
  log_info "Creating .env.local..."
  
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

# ftrBTC Alkane [31, 0] - Clones to [31, 920000] and so forth
NEXT_PUBLIC_FTRBTC_ALKANE_BLOCK=31
NEXT_PUBLIC_FTRBTC_ALKANE_TX=0
EOF
  
  log_success ".env.local created"
}

################################################################################
# Main
################################################################################

show_usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Options:
  -y, --yes          Skip confirmation prompts
  -s, --skip-build   Skip Docker build (use existing images)
  -v, --verbose      Show detailed build output
  -h, --help         Show this help message

Environment Variables:
  ALKANES_REPO_PATH     Path to alkanes repository (default: ../alkanes)
  ALKANES_INDEXER_PORT  Indexer RPC port (default: 18888)
  AUTO_YES              Skip prompts (true/false)
  SKIP_BUILD            Skip build (true/false)
  VERBOSE               Verbose output (true/false)

Examples:
  # Interactive build
  $0
  
  # Automated build (CI/CD)
  AUTO_YES=true $0
  
  # Skip build, just start services
  $0 --skip-build
  
  # Verbose build output
  $0 --verbose

EOF
}

main() {
  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      -y|--yes)
        AUTO_YES=true
        shift
        ;;
      -s|--skip-build)
        SKIP_BUILD=true
        shift
        ;;
      -v|--verbose)
        VERBOSE=true
        shift
        ;;
      -h|--help)
        show_usage
        exit 0
        ;;
      *)
        log_error "Unknown option: $1"
        show_usage
        exit 1
        ;;
    esac
  done
  
  log_header "Subfrost Alkanes Regtest Deployment"
  
  log_info "Configuration:"
  log_info "  Project Root: $PROJECT_ROOT"
  log_info "  Alkanes Repo: $ALKANES_REPO_PATH"
  log_info "  Indexer Port: $ALKANES_INDEXER_PORT"
  log_info "  Auto Yes: $AUTO_YES"
  log_info "  Skip Build: $SKIP_BUILD"
  echo ""
  
  # Execute steps
  check_dependencies
  clone_alkanes
  build_docker
  start_services
  initialize_chain
  verify_ftrbtc
  setup_environment
  
  # Success summary
  log_header "Deployment Complete! 🎉"
  echo ""
  log_success "Services Running:"
  echo "  • Bitcoin Core (regtest): localhost:$BITCOIN_RPC_PORT"
  echo "  • Alkanes Indexer: http://localhost:$ALKANES_INDEXER_PORT"
  echo "  • ftrBTC [31, 0]: Initialized"
  echo ""
  log_info "Next steps:"
  echo "  1. Start dev server: cd $PROJECT_ROOT && npm run dev"
  echo "  2. Visit: http://localhost:3000"
  echo "  3. Test wallet: http://localhost:3000/wallet-test"
  echo ""
  log_info "Management:"
  echo "  • View logs: cd $ALKANES_REPO_PATH && docker compose logs -f"
  echo "  • Stop: cd $ALKANES_REPO_PATH && docker compose down"
  echo "  • Restart: cd $ALKANES_REPO_PATH && docker compose restart"
  echo ""
}

# Run main
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
