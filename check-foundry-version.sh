#!/bin/bash

# Quick Foundry version check
APP_NAME="${1:-code-backend}"

echo "🔍 Foundry Version Check"
echo "======================="
echo ""

if [ "$APP_NAME" = "local" ]; then
    echo "📋 Local Foundry Version:"
    forge --version 2>&1 || echo "❌ Foundry not installed locally"
else
    echo "📋 Foundry Version on Fly.io ($APP_NAME):"
    echo ""
    
    # Try direct path
    echo "1. Direct path check:"
    flyctl ssh console --app "$APP_NAME" -C '/root/.foundry/bin/forge --version' 2>&1 | grep -v "Connecting" | grep -v "complete" | head -5
    
    echo ""
    echo "2. PATH check:"
    flyctl ssh console --app "$APP_NAME" -C 'export PATH="/root/.foundry/bin:$PATH" && forge --version' 2>&1 | grep -v "Connecting" | grep -v "complete" | head -5
    
    echo ""
    echo "3. Binary exists:"
    flyctl ssh console --app "$APP_NAME" -C 'ls -lh /root/.foundry/bin/forge' 2>&1 | grep -v "Connecting" | grep -v "complete"
fi

echo ""
echo "✅ Check complete"
