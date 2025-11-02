#!/bin/bash

# Test Admin Compilation
# This script logs in as admin and compiles Solidity code

API_BASE="https://code-backend.fly.dev"
EMAIL="gimer@dappdojo.com"
PASSWORD="Ottawa!1978"

# Contract code to compile
CODE='// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

contract SimpleStorage {
    uint256 private storedValue;

    function setValue(uint256 _value) public {
        storedValue = _value;
    }

    function getValue() public view returns (uint256) {
        return storedValue;
    }
}'

echo "🔐 Step 1: Logging in as admin..."
echo ""

# Login and get JWT token
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"${EMAIL}\",
    \"password\": \"${PASSWORD}\"
  }")

# Extract access token (using jq if available, otherwise use sed)
if command -v jq &> /dev/null; then
  TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.accessToken // empty')
  SUCCESS=$(echo "$LOGIN_RESPONSE" | jq -r '.success // false')
else
  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
  SUCCESS=$(echo "$LOGIN_RESPONSE" | grep -q '"success":true' && echo "true" || echo "false")
fi

if [ "$SUCCESS" != "true" ] || [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  echo "$LOGIN_RESPONSE" | jq . 2>/dev/null || echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Login successful!"
echo ""

echo "📋 Step 2: Compiling code..."
echo "   Course: solidity-101"
echo "   Contract: SimpleStorage"
echo ""

# Compile the code
curl -X POST "${API_BASE}/api/compile" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"courseId\": \"solidity-101\",
    \"code\": $(echo "$CODE" | jq -Rs .),
    \"contractName\": \"SimpleStorage\"
  }" | jq .

echo ""
echo "✅ Done!"

