#!/bin/bash

# Step 1: Login and get token
echo "🔐 Logging in..."
TOKEN=$(curl -s -X POST https://code-backend.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"gimer@dappdojo.com","password":"Ottawa!1978"}' \
  | python3 -c "import sys, json; print(json.load(sys.stdin).get('accessToken', ''))" 2>/dev/null \
  || curl -s -X POST https://code-backend.fly.dev/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"gimer@dappdojo.com","password":"Ottawa!1978"}' \
      | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Login failed!"
  exit 1
fi

echo "✅ Login successful!"
echo ""

# Step 2: Compile code
echo "📋 Compiling SimpleStorage contract..."
echo ""

curl -X POST https://code-backend.fly.dev/api/compile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "courseId": "solidity-101",
    "contractName": "SimpleStorage",
    "code": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.30;\n\ncontract SimpleStorage {\n    uint256 private storedValue;\n\n    function setValue(uint256 _value) public {\n        storedValue = _value;\n    }\n\n    function getValue() public view returns (uint256) {\n        return storedValue;\n    }\n}"
  }' | python3 -m json.tool 2>/dev/null || cat

echo ""
echo "✅ Done!"
