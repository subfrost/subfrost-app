#!/bin/bash

# Script to capture mint button error logs from browser console and server

echo "=========================================="
echo "Mint Button Error Log Capture"
echo "=========================================="
echo ""
echo "To capture errors:"
echo ""
echo "1. BROWSER CONSOLE ERRORS:"
echo "   - Open browser DevTools (F12)"
echo "   - Go to Console tab"
echo "   - Click mint button"
echo "   - Look for '=== Mint Button Error ===' or '=== Mint API error ==='"
echo "   - Right-click the error and select 'Copy message' or 'Copy object'"
echo "   - Save to: mint-error-browser.log"
echo ""
echo "2. SERVER/TERMINAL ERRORS:"
echo "   - Look at the terminal where 'npm run dev:regtest' is running"
echo "   - Look for '=== Mint API error ===' in the output"
echo "   - Copy that section"
echo "   - Save to: mint-error-server.log"
echo ""
echo "3. QUICK CHECK - Test the API directly:"
echo ""

# Test if dev server is running
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Dev server is running on port 3000"
    echo ""
    echo "Testing mint API..."
    echo ""
    
    RESPONSE=$(curl -s -X POST http://localhost:3000/api/regtest/mint \
      -H "Content-Type: application/json" \
      -d '{"address": "bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "tokens": {"btc": 0.01}}' \
      --max-time 15 2>&1)
    
    if [ $? -eq 0 ]; then
        echo "API Response:"
        echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
    else
        echo "❌ API call timed out or failed"
        echo "$RESPONSE"
    fi
else
    echo "❌ Dev server is NOT running on port 3000"
    echo "   Start it with: npm run dev:regtest"
fi

echo ""
echo "=========================================="
echo "After collecting errors, save them to files and share:"
echo "  - mint-error-browser.log (from browser console)"
echo "  - mint-error-server.log (from terminal output)"
echo "=========================================="
