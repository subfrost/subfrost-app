#!/bin/bash

# Fund Test Wallet Script for E2E Testing
#
# This script mines BTC to a specified address on regtest.
# Used to fund wallets for E2E testing.
#
# PREREQUISITES:
# - Docker alkanes-rs stack running
#
# USAGE:
#   ./scripts/fund-test-wallet.sh [ADDRESS] [NUM_BLOCKS]
#
# EXAMPLES:
#   ./scripts/fund-test-wallet.sh bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx 101
#   ./scripts/fund-test-wallet.sh  # Uses default "abandon..." mnemonic address

set -e

# Configuration
BITCOIND_CONTAINER="${BITCOIND_CONTAINER:-alkanes-rs-bitcoind-1}"
RPC_USER="${RPC_USER:-bitcoinrpc}"
RPC_PASSWORD="${RPC_PASSWORD:-bitcoinrpc}"
SANDSHREW_RPC="${SANDSHREW_RPC:-http://localhost:18888}"

# Default address: first native segwit address from "abandon...about" mnemonic
DEFAULT_ADDRESS="bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx"

# Parameters
ADDRESS="${1:-$DEFAULT_ADDRESS}"
NUM_BLOCKS="${2:-101}"  # 101 blocks for coinbase maturity

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if docker container is running
check_container() {
    if ! docker ps --format '{{.Names}}' | grep -q "^${BITCOIND_CONTAINER}$"; then
        log_error "Bitcoin container '$BITCOIND_CONTAINER' is not running"
        log_info "Start the alkanes-rs docker stack first"
        exit 1
    fi
    log_success "Found Bitcoin container: $BITCOIND_CONTAINER"
}

# Get current balance for address
get_balance() {
    local addr="$1"
    local result
    result=$(curl -s -X POST "$SANDSHREW_RPC" \
        -H "Content-Type: application/json" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"esplora_address\",\"params\":[\"$addr\"]}" 2>/dev/null)

    local funded=$(echo "$result" | grep -o '"funded_txo_sum":[0-9]*' | head -1 | cut -d: -f2)
    local spent=$(echo "$result" | grep -o '"spent_txo_sum":[0-9]*' | head -1 | cut -d: -f2)

    if [ -z "$funded" ]; then funded=0; fi
    if [ -z "$spent" ]; then spent=0; fi

    echo $((funded - spent))
}

# Mine blocks to address
mine_to_address() {
    local addr="$1"
    local blocks="$2"

    log_info "Mining $blocks blocks to $addr..."

    docker exec "$BITCOIND_CONTAINER" /opt/bitcoin-28.0/bin/bitcoin-cli \
        -regtest \
        -rpcuser="$RPC_USER" \
        -rpcpassword="$RPC_PASSWORD" \
        generatetoaddress "$blocks" "$addr" > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        log_success "Mined $blocks blocks"
    else
        log_error "Failed to mine blocks"
        exit 1
    fi
}

# Wait for indexer to sync
wait_for_sync() {
    log_info "Waiting for indexer to sync..."
    sleep 5
}

# Main
main() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Fund Test Wallet for E2E Testing${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════${NC}"
    echo ""

    log_info "Target address: $ADDRESS"
    log_info "Blocks to mine: $NUM_BLOCKS"
    echo ""

    # Check prerequisites
    check_container

    # Get initial balance
    local initial_balance=$(get_balance "$ADDRESS")
    local initial_btc=$(echo "scale=8; $initial_balance / 100000000" | bc 2>/dev/null || echo "0")
    log_info "Initial balance: $initial_balance sats ($initial_btc BTC)"

    # Mine blocks
    mine_to_address "$ADDRESS" "$NUM_BLOCKS"

    # Wait for sync
    wait_for_sync

    # Get final balance
    local final_balance=$(get_balance "$ADDRESS")
    local final_btc=$(echo "scale=8; $final_balance / 100000000" | bc 2>/dev/null || echo "0")
    local added=$((final_balance - initial_balance))
    local added_btc=$(echo "scale=8; $added / 100000000" | bc 2>/dev/null || echo "0")

    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Wallet Funded Successfully!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo ""
    log_success "Final balance: $final_balance sats ($final_btc BTC)"
    log_success "Added: $added sats ($added_btc BTC)"
    echo ""
    log_info "Address: $ADDRESS"
    log_info "Ready for E2E testing!"
    echo ""
}

main "$@"
