#!/bin/bash
################################################################################
# Setup Deployment Wallet for Contract Deployment
################################################################################

set -e

export PATH="/Users/erickdelgado/Documents/github/alkanes-rs/target/release:$PATH"

WALLET_DIR="$HOME/.alkanes"
WALLET_FILE="$WALLET_DIR/regtest-deploy.wallet"
PASSPHRASE="deployment123"
MNEMONIC="abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"

echo "Setting up deployment wallet..."

# Create wallet directory
mkdir -p "$WALLET_DIR"

# Check if wallet already exists
if [ -f "$WALLET_FILE" ]; then
    echo "✅ Wallet file already exists: $WALLET_FILE"
else
    echo "Creating new wallet..."
    # Create wallet with known mnemonic
    echo "$PASSPHRASE" | alkanes-cli -p regtest wallet create "$MNEMONIC" > "$WALLET_DIR/wallet-creation.log" 2>&1
    
    # Save wallet info
    echo "$MNEMONIC" > "$WALLET_FILE.mnemonic"
    echo "$PASSPHRASE" > "$WALLET_FILE.passphrase"
    chmod 600 "$WALLET_FILE.mnemonic" "$WALLET_FILE.passphrase"
    
    echo "✅ Wallet created"
fi

# Get wallet address
echo "Getting wallet address..."
WALLET_ADDRESS=$(alkanes-cli -p regtest --passphrase "$PASSPHRASE" wallet addresses | grep "bcrt" | head -1 | awk '{print $NF}')

if [ -z "$WALLET_ADDRESS" ]; then
    echo "❌ Could not get wallet address"
    exit 1
fi

echo "✅ Wallet address: $WALLET_ADDRESS"

# Save address
echo "$WALLET_ADDRESS" > "$WALLET_FILE.address"

# Fund wallet by generating blocks
echo "Funding wallet (generating 101 blocks)..."
alkanes-cli -p regtest bitcoind generatetoaddress 101 "$WALLET_ADDRESS" > /dev/null 2>&1

# Sync wallet
echo "Syncing wallet..."
alkanes-cli -p regtest --passphrase "$PASSPHRASE" wallet sync > /dev/null 2>&1 || true

# Check balance
echo "Checking balance..."
BALANCE=$(alkanes-cli -p regtest --passphrase "$PASSPHRASE" wallet balance 2>&1 | grep -oE '[0-9]+ sats' || echo "0 sats")

echo "✅ Wallet balance: $BALANCE"
echo ""
echo "Wallet setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Mnemonic file: $WALLET_FILE.mnemonic"
echo "Passphrase file: $WALLET_FILE.passphrase"
echo "Address file: $WALLET_FILE.address"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
