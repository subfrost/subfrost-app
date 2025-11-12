#!/bin/bash
# Bitcoin Regtest Helper Script

export PATH="$HOME/bitcoin/bitcoin-25.0/bin:$PATH"

case "$1" in
  start)
    echo "Starting Bitcoin regtest node..."
    bitcoind -regtest -daemon
    sleep 2
    bitcoin-cli -regtest getblockchaininfo | head -5
    ;;
  stop)
    echo "Stopping Bitcoin regtest node..."
    bitcoin-cli -regtest stop
    ;;
  status)
    echo "Bitcoin regtest node status:"
    bitcoin-cli -regtest getblockchaininfo 2>&1 | head -10
    ;;
  balance)
    echo "Wallet balance:"
    bitcoin-cli -regtest getbalance
    ;;
  mine)
    BLOCKS=${2:-1}
    ADDR=$(bitcoin-cli -regtest getnewaddress)
    echo "Mining $BLOCKS blocks to $ADDR..."
    bitcoin-cli -regtest generatetoaddress $BLOCKS $ADDR
    ;;
  address)
    bitcoin-cli -regtest getnewaddress
    ;;
  send)
    if [ -z "$2" ] || [ -z "$3" ]; then
      echo "Usage: $0 send <address> <amount>"
      exit 1
    fi
    echo "Sending $3 BTC to $2..."
    bitcoin-cli -regtest sendtoaddress $2 $3
    ;;
  *)
    echo "Bitcoin Regtest Helper"
    echo ""
    echo "Usage: $0 {start|stop|status|balance|mine|address|send}"
    echo ""
    echo "Commands:"
    echo "  start           - Start the Bitcoin regtest node"
    echo "  stop            - Stop the Bitcoin regtest node"
    echo "  status          - Check node status"
    echo "  balance         - Show wallet balance"
    echo "  mine [blocks]   - Mine blocks (default: 1)"
    echo "  address         - Generate new address"
    echo "  send <addr> <amount> - Send BTC to address"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 mine 6"
    echo "  $0 send bcrt1q... 1.0"
    ;;
esac
