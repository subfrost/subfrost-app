#!/bin/bash

# Simple deployment script
set -e

echo "========================================"
echo "Alkanes Integration - Simple Deploy"
echo "========================================"
echo ""

# Step 1: Build SDK
echo "📦 Building TypeScript SDK..."
cd /Users/erickdelgado/Documents/github/alkanes-rs/ts-sdk
npx tsup src/index.ts --format cjs,esm --dts --clean

if [ $? -eq 0 ]; then
  echo "✅ SDK built"
else
  echo "❌ Build failed"
  exit 1
fi

# Step 2: Link globally
echo ""
echo "🔗 Linking globally..."
npm link

if [ $? -eq 0 ]; then
  echo "✅ Linked globally"
else
  echo "❌ Link failed"
  exit 1
fi

# Step 3: Link to app
echo ""
echo "🔗 Linking to subfrost-appx..."
cd /Users/erickdelgado/Documents/github/subfrost-appx
npm link @alkanes/ts-sdk

if [ $? -eq 0 ]; then
  echo "✅ Linked to app"
else
  echo "❌ Link to app failed"
  exit 1
fi

# Step 4: Create .env.local
echo ""
echo "⚙️  Creating .env.local..."
if [ ! -f ".env.local" ]; then
  cat > .env.local << 'EOF'
NEXT_PUBLIC_NETWORK=regtest
NEXT_PUBLIC_BITCOIN_RPC_URL=http://localhost:18443
NEXT_PUBLIC_BITCOIN_RPC_USER=user
NEXT_PUBLIC_BITCOIN_RPC_PASSWORD=pass
NEXT_PUBLIC_ALKANES_ENABLED=true
EOF
  echo "✅ .env.local created"
else
  echo "⚠️  .env.local already exists (skipping)"
fi

# Done
echo ""
echo "========================================"
echo "✅ Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. npm run dev"
echo "2. Visit http://localhost:3000/wallet-test"
echo ""
echo "Optional - Start Bitcoin Core regtest:"
echo "bitcoind -regtest -daemon -rpcuser=user -rpcpassword=pass -rpcport=18443"
echo ""
