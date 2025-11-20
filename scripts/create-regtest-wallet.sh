#!/bin/bash

# Helper script to create a regtest wallet for deploy-regtest.sh
# This avoids the interactive prompt issue during deployment

set -e

ALKANES_DIR="${ALKANES_DIR:-$HOME/alkanes-rs}"
ALKANES_CLI="$ALKANES_DIR/target/release/alkanes-cli"
WALLET_FILE="${WALLET_FILE:-$HOME/.alkanes/regtest-wallet.json}"
WALLET_PASSPHRASE="${WALLET_PASSPHRASE:-testtesttest}"
SANDSHREW_RPC="${SANDSHREW_RPC:-http://localhost:18888}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}Creating regtest wallet for Subfrost deployment${NC}"
echo ""

# Check if wallet already exists
if [ -f "$WALLET_FILE" ]; then
    echo -e "${YELLOW}Wallet already exists at: $WALLET_FILE${NC}"
    echo -e "${YELLOW}Delete it first if you want to create a new one.${NC}"
    exit 0
fi

# Create directory
mkdir -p "$(dirname "$WALLET_FILE")"

echo -e "${BLUE}Using passphrase: $WALLET_PASSPHRASE${NC}"
echo -e "${BLUE}Wallet will be saved to: $WALLET_FILE${NC}"
echo ""

# Create wallet interactively
"$ALKANES_CLI" -p regtest \
    --sandshrew-rpc-url "$SANDSHREW_RPC" \
    --wallet-file "$WALLET_FILE" \
    wallet create

echo ""
echo -e "${GREEN}✓ Wallet created successfully!${NC}"
echo ""
echo -e "${BLUE}To use this wallet with deploy-regtest.sh, set:${NC}"
echo -e "  ${GREEN}export WALLET_PASSPHRASE='$WALLET_PASSPHRASE'${NC}"
echo ""
echo -e "${BLUE}Then run:${NC}"
echo -e "  ${GREEN}./scripts/deploy-regtest.sh${NC}"
