#!/bin/bash

# Helper script to start the Subfrost app

cd "$(dirname "$0")"

echo "🚀 Starting Subfrost app..."
echo ""
echo "The app will be available at:"
echo "  http://localhost:3000"
echo ""
echo "Futures page:"
echo "  http://localhost:3000/futures"
echo ""
echo "Press Ctrl+C to stop"
echo ""

npm run dev
