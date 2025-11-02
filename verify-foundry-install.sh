#!/bin/bash

# Comprehensive Foundry installation verification
APP_NAME="${1:-code-backend}"

echo "🔍 Foundry Installation Verification"
echo "===================================="
echo ""

if [ "$APP_NAME" = "local" ]; then
    echo "📋 Local Foundry Check:"
    if command -v forge &> /dev/null; then
        echo "✅ Foundry installed locally"
        forge --version 2>&1 | head -3
    else
        echo "❌ Foundry not installed locally"
    fi
    exit 0
fi

echo "📋 Checking Foundry on Fly.io: $APP_NAME"
echo ""

echo "1️⃣  Binary Files:"
echo "   Checking if Foundry binaries exist..."
flyctl ssh console --app "$APP_NAME" -C 'ls -lh /root/.foundry/bin/' 2>&1 | grep -v "Connecting" | grep -v "complete" | grep -E "(forge|cast|anvil|foundryup)"

echo ""
echo "2️⃣  File Permissions:"
flyctl ssh console --app "$APP_NAME" -C 'file /root/.foundry/bin/forge' 2>&1 | grep -v "Connecting" | grep -v "complete"

echo ""
echo "3️⃣  Shared Libraries Check:"
echo "   Checking for missing libraries..."
flyctl ssh console --app "$APP_NAME" -C 'ldd /root/.foundry/bin/forge 2>&1 | head -20' 2>&1 | grep -v "Connecting" | grep -v "complete"

echo ""
echo "4️⃣  PATH Environment:"
flyctl ssh console --app "$APP_NAME" -C 'echo $PATH' 2>&1 | grep -v "Connecting" | grep -v "complete"

echo ""
echo "5️⃣  Foundry Version (using bash -c):"
flyctl ssh console --app "$APP_NAME" -C 'bash -c "/root/.foundry/bin/forge --version"' 2>&1 | grep -v "Connecting" | grep -v "complete" | head -5

echo ""
echo "6️⃣  Testing Foundry Build:"
echo "   Creating a simple test..."
flyctl ssh console --app "$APP_NAME" -C 'bash -c "cd /tmp && mkdir -p test-forge && cd test-forge && echo \"pragma solidity ^0.8.0; contract Test { function test() pure returns (uint) { return 1; } }\" > Test.sol && /root/.foundry/bin/forge build 2>&1 | tail -5"' 2>&1 | grep -v "Connecting" | grep -v "complete"

echo ""
echo "✅ Verification Complete"
