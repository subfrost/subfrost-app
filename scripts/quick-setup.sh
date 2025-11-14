#!/bin/bash

################################################################################
# Quick Setup - Build and Link Alkanes SDK Only
# 
# Use this when you just want to build/link the SDK without Bitcoin Core
################################################################################

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=========================================${NC}"
echo -e "${BLUE}Quick Alkanes SDK Setup${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Build TypeScript SDK
echo "📦 Building TypeScript SDK..."
cd /Users/erickdelgado/Documents/github/alkanes-rs/ts-sdk
npx tsup src/index.ts --format cjs,esm --dts --clean

# Link globally
echo "🔗 Linking globally..."
npm link

# Link to subfrost-app
echo "🔗 Linking to subfrost-appx..."
cd /Users/erickdelgado/Documents/github/subfrost-appx
npm link @alkanes/ts-sdk

echo ""
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo "Next steps:"
echo "  cd /Users/erickdelgado/Documents/github/subfrost-appx"
echo "  npm run dev"
echo ""
echo "Visit: http://localhost:3000/wallet-test"
echo ""
