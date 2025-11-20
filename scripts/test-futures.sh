#!/bin/bash

# Test script for futures (ftrBTC) functionality
# Tests generating and claiming futures on regtest

set -e

# Configuration
ALKANES_DIR="${ALKANES_DIR:-$HOME/alkanes-rs}"
ALKANES_CLI="$ALKANES_DIR/target/release/alkanes-cli"
WALLET_FILE="${WALLET_FILE:-$HOME/.alkanes/regtest-wallet.json}"
SANDSHREW_RPC="${SANDSHREW_RPC:-http://localhost:18888}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Testing Futures (ftrBTC) Functionality${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check current block height
echo -e "${BLUE}1. Checking current block height...${NC}"
BLOCK_HEIGHT=$("$ALKANES_CLI" -p regtest --sandshrew-rpc-url "$SANDSHREW_RPC" bitcoind getblockcount)
echo -e "${GREEN}   Current block: $BLOCK_HEIGHT${NC}"
echo ""

# Since generatefuture RPC is not available, we'll use a workaround:
# Generate regular blocks and check if futures exist at [31, height]
echo -e "${BLUE}2. Generating a few blocks to test...${NC}"
WALLET_ADDR=$("$ALKANES_CLI" -p regtest --wallet-file "$WALLET_FILE" wallet addresses | grep "0\. bcrt" | awk '{print $2}')
echo -e "${GREEN}   Using address: $WALLET_ADDR${NC}"

# Generate 3 blocks
for i in {1..3}; do
    echo -e "${BLUE}   Generating block $i...${NC}"
    BLOCK_HASH=$(curl -s --user alkanes:alkanes --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"test\",\"method\":\"generatetoaddress\",\"params\":[1,\"$WALLET_ADDR\"]}" http://localhost:18443 | jq -r '.result[0]')
    NEW_HEIGHT=$("$ALKANES_CLI" -p regtest --sandshrew-rpc-url "$SANDSHREW_RPC" bitcoind getblockcount)
    echo -e "${GREEN}   ✓ Block $NEW_HEIGHT: $BLOCK_HASH${NC}"
done
echo ""

# Get updated block height
BLOCK_HEIGHT=$("$ALKANES_CLI" -p regtest --sandshrew-rpc-url "$SANDSHREW_RPC" bitcoind getblockcount)
echo -e "${GREEN}   New block height: $BLOCK_HEIGHT${NC}"
echo ""

# Check for futures at [31, height]
echo -e "${BLUE}3. Checking for futures at [31, n]...${NC}"
echo -e "${YELLOW}   Note: Without the patched Bitcoin Core generatefuture RPC,${NC}"
echo -e "${YELLOW}   futures need to be created via frBTC contract call [32, 0, 77]${NC}"
echo ""

# Try to query a few recent heights
for height in $(seq $(($BLOCK_HEIGHT - 10)) $BLOCK_HEIGHT); do
    echo -e "${BLUE}   Checking [31, $height]...${NC}"
    BALANCE=$("$ALKANES_CLI" -p regtest --wallet-file "$WALLET_FILE" --sandshrew-rpc-url "$SANDSHREW_RPC" alkanes getbalance 2>/dev/null | jq -r ".alkanes.\"31:$height\" // \"0\"" || echo "0")
    if [ "$BALANCE" != "0" ] && [ "$BALANCE" != "null" ]; then
        echo -e "${GREEN}   ✓ Found future at [31, $height] with balance: $BALANCE${NC}"
    fi
done
echo ""

echo -e "${BLUE}4. Testing claim futures cellpack [31, 0, 14]...${NC}"
echo -e "${YELLOW}   This would claim all pending futures${NC}"
echo ""
echo -e "${BLUE}   Command to claim (not executing automatically):${NC}"
echo -e "${GREEN}   $ALKANES_CLI -p regtest --wallet-file $WALLET_FILE \\${NC}"
echo -e "${GREEN}     alkanes execute \"[31,0,14]\" --fee-rate 1 --mine -y${NC}"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}The generatefuture RPC requires patched Bitcoin Core.${NC}"
echo -e "${YELLOW}To properly test futures:${NC}"
echo ""
echo -e "1. ${GREEN}Rebuild Bitcoin Core with the patch:${NC}"
echo -e "   cd ~/alkanes-rs"
echo -e "   docker-compose build bitcoind"
echo -e "   docker-compose up -d bitcoind"
echo ""
echo -e "2. ${GREEN}Then use generatefuture:${NC}"
echo -e "   $ALKANES_CLI -p regtest bitcoind generatefuture"
echo ""
echo -e "3. ${GREEN}Check for futures in UI:${NC}"
echo -e "   Navigate to http://localhost:3000/futures"
echo -e "   Click 'Generate Future' button"
echo ""
echo -e "4. ${GREEN}Claim futures:${NC}"
echo -e "   $ALKANES_CLI -p regtest --wallet-file $WALLET_FILE \\"
echo -e "     alkanes execute \"[31,0,14]\" --fee-rate 1 --mine -y"
echo ""
