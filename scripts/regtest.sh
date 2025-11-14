#!/bin/bash

# Subfrost Regtest Helper Script
# Provides convenient commands for managing the regtest environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
ALKANES_DIR="$PROJECT_ROOT/reference/alkanes"

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Check if docker-compose is running
check_running() {
    cd "$ALKANES_DIR"
    if ! docker-compose ps -q 2>/dev/null | grep -q .; then
        error "Docker-compose services are not running!"
        info "Run: ./scripts/setup-regtest.sh"
        exit 1
    fi
}

# Execute bitcoin-cli command
btc_cli() {
    cd "$ALKANES_DIR"
    docker-compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc "$@"
}

# Show usage
usage() {
    cat << EOF
Subfrost Regtest Helper

Usage: $0 <command> [arguments]

Commands:
  start              Start the regtest environment
  stop               Stop the regtest environment
  restart            Restart all services
  reset              Stop and remove all data (fresh start)
  
  status             Show status of all services
  logs [service]     Show logs (optionally for specific service)
  
  mine [blocks]      Mine blocks (default: 6)
  balance            Show wallet balance
  address            Get a new Bitcoin address
  send <addr> <amt>  Send Bitcoin to an address
  
  blockcount         Get current block height
  mempool            Show mempool info
  peers              List connected peers
  
  shell [service]    Open a shell in a service container (default: bitcoind)
  
Examples:
  $0 mine 10              # Mine 10 blocks
  $0 send bcrt1q... 1.5   # Send 1.5 BTC
  $0 logs metashrew       # View metashrew logs
  $0 shell jsonrpc        # Open shell in jsonrpc container

Services: bitcoind, metashrew, memshrew, jsonrpc, ord, esplora, espo

EOF
}

# Parse commands
case "${1:-}" in
    start)
        info "Starting regtest environment..."
        cd "$ALKANES_DIR"
        docker-compose up -d
        success "Services started"
        info "Wait a few seconds for services to initialize"
        ;;
        
    stop)
        info "Stopping regtest environment..."
        cd "$ALKANES_DIR"
        docker-compose down
        success "Services stopped"
        ;;
        
    restart)
        info "Restarting regtest environment..."
        cd "$ALKANES_DIR"
        docker-compose restart
        success "Services restarted"
        ;;
        
    reset)
        echo -e "${YELLOW}⚠ WARNING: This will delete all blockchain data!${NC}"
        read -p "Are you sure? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            info "Resetting environment..."
            cd "$ALKANES_DIR"
            docker-compose down -v
            success "All data removed"
            info "Run './scripts/setup-regtest.sh' to reinitialize"
        else
            info "Cancelled"
        fi
        ;;
        
    status)
        check_running
        info "Service status:"
        cd "$ALKANES_DIR"
        docker-compose ps
        ;;
        
    logs)
        check_running
        SERVICE="${2:-}"
        cd "$ALKANES_DIR"
        if [ -z "$SERVICE" ]; then
            docker-compose logs -f
        else
            docker-compose logs -f "$SERVICE"
        fi
        ;;
        
    mine)
        check_running
        BLOCKS="${2:-6}"
        info "Mining $BLOCKS blocks..."
        ADDRESS=$(btc_cli getnewaddress | tr -d '\r')
        btc_cli generatetoaddress "$BLOCKS" "$ADDRESS" >/dev/null
        HEIGHT=$(btc_cli getblockcount | tr -d '\r')
        success "Mined $BLOCKS blocks. Current height: $HEIGHT"
        ;;
        
    balance)
        check_running
        BALANCE=$(btc_cli getbalance | tr -d '\r')
        echo "Wallet balance: $BALANCE BTC"
        ;;
        
    address)
        check_running
        ADDRESS=$(btc_cli getnewaddress | tr -d '\r')
        echo "New address: $ADDRESS"
        ;;
        
    send)
        check_running
        if [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
            error "Usage: $0 send <address> <amount>"
            exit 1
        fi
        ADDRESS="$2"
        AMOUNT="$3"
        info "Sending $AMOUNT BTC to $ADDRESS..."
        TXID=$(btc_cli sendtoaddress "$ADDRESS" "$AMOUNT" | tr -d '\r')
        success "Transaction sent: $TXID"
        info "Mine blocks to confirm: $0 mine 6"
        ;;
        
    blockcount)
        check_running
        HEIGHT=$(btc_cli getblockcount | tr -d '\r')
        echo "Block height: $HEIGHT"
        ;;
        
    mempool)
        check_running
        btc_cli getmempoolinfo
        ;;
        
    peers)
        check_running
        btc_cli getpeerinfo
        ;;
        
    shell)
        check_running
        SERVICE="${2:-bitcoind}"
        info "Opening shell in $SERVICE container..."
        cd "$ALKANES_DIR"
        docker-compose exec "$SERVICE" /bin/sh
        ;;
        
    help|--help|-h|"")
        usage
        ;;
        
    *)
        error "Unknown command: $1"
        echo ""
        usage
        exit 1
        ;;
esac
