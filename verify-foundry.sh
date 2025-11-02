#!/bin/bash

# Script to verify Foundry installation and version
APP_NAME="${1:-code-backend}"

echo "🔍 Foundry Installation Verification"
echo "===================================="
echo ""

# Check if we're verifying locally or on Fly.io
if [ "$APP_NAME" = "local" ] || [ -z "$APP_NAME" ] || [ ! -f "index.js" ]; then
    echo "📋 Checking Local Foundry Installation..."
    echo ""
    
    if command -v forge &> /dev/null; then
        echo "✅ Foundry is installed locally"
        echo ""
        echo "Version:"
        forge --version 2>&1
        echo ""
        echo "Location:"
        which forge
        echo ""
        echo "Available commands:"
        if [ -d "$HOME/.foundry/bin" ]; then
            ls -la "$HOME/.foundry/bin/"
        else
            echo "   (~/.foundry/bin not found locally)"
        fi
    else
        echo "❌ Foundry not installed locally"
        echo "   (This is fine - Foundry is installed in Docker/Fly.io)"
    fi
    
    echo ""
    echo "📋 Docker Configuration:"
    if [ -f "Dockerfile" ]; then
        echo "✅ Dockerfile found"
        echo ""
        if grep -q "foundry\|forge\|foundryup" Dockerfile; then
            echo "✅ Foundry installation found in Dockerfile:"
            grep -i "foundry\|forge\|foundryup" Dockerfile | head -5
        else
            echo "❌ No Foundry installation found in Dockerfile"
        fi
    else
        echo "⚠️  Dockerfile not found"
    fi
else
    echo "📋 Checking Foundry on Fly.io..."
    echo "   App: $APP_NAME"
    echo ""
    
    echo "1️⃣  Checking if Foundry is installed..."
    if flyctl ssh console --app "$APP_NAME" -C "which forge" 2>/dev/null | grep -q "forge"; then
        echo "✅ Foundry is installed"
        echo ""
        
        echo "2️⃣  Foundry Version:"
        flyctl ssh console --app "$APP_NAME" -C "forge --version" 2>&1 | grep -v "Connecting" | grep -v "complete"
        echo ""
        
        echo "3️⃣  Foundry Location:"
        flyctl ssh console --app "$APP_NAME" -C "which forge" 2>&1 | grep -v "Connecting" | grep -v "complete"
        echo ""
        
        echo "4️⃣  Available Foundry Commands:"
        flyctl ssh console --app "$APP_NAME" -C "ls -la /root/.foundry/bin/" 2>&1 | grep -v "Connecting" | grep -v "complete"
        echo ""
        
        echo "5️⃣  Testing Forge Compilation:"
        echo "   Creating a test contract..."
        flyctl ssh console --app "$APP_NAME" -C "cd /tmp && mkdir -p test-foundry && cd test-foundry && echo 'pragma solidity ^0.8.0; contract Test { function test() public pure returns (uint256) { return 1; } }' > Test.sol && forge build 2>&1 | tail -10" 2>&1 | grep -v "Connecting" | grep -v "complete"
        echo ""
        echo "   ✅ Foundry compilation test completed"
    else
        echo "❌ Foundry not found or installation failed"
        echo ""
        echo "Checking installation..."
        flyctl ssh console --app "$APP_NAME" -C "ls -la /root/.foundry/bin/ 2>&1 || echo 'Foundry directory not found'" 2>&1 | grep -v "Connecting" | grep -v "complete"
    fi
    
    echo ""
    echo "6️⃣  Environment Check:"
    echo "   FOUNDRY_CACHE_DIR:"
    flyctl ssh console --app "$APP_NAME" -C "echo \$FOUNDRY_CACHE_DIR" 2>&1 | grep -v "Connecting" | grep -v "complete"
    echo ""
    echo "   Foundry projects directory:"
    flyctl ssh console --app "$APP_NAME" -C "ls -la /app/foundry-projects 2>&1 | head -5" 2>&1 | grep -v "Connecting" | grep -v "complete"
fi

echo ""
echo "✅ Verification Complete"

