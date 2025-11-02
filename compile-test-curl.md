# Test Admin Compilation with curl

## Quick Test (One-liner)

First, login and save the token:

```bash
# Login and get token (replace with your credentials)
TOKEN=$(curl -s -X POST https://code-backend.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"gimer@dappdojo.com","password":"Ottawa!1978"}' \
  | jq -r '.accessToken')

# Compile code
curl -X POST https://code-backend.fly.dev/api/compile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "courseId": "solidity-101",
    "code": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.30;\n\ncontract SimpleStorage {\n    uint256 private storedValue;\n\n    function setValue(uint256 _value) public {\n        storedValue = _value;\n    }\n\n    function getValue() public view returns (uint256) {\n        return storedValue;\n    }\n}",
    "contractName": "SimpleStorage"
  }' | jq .
```

## Step-by-Step

### Step 1: Login and Get Token

```bash
curl -X POST https://code-backend.fly.dev/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "gimer@dappdojo.com",
    "password": "Ottawa!1978"
  }'
```

Save the `accessToken` from the response.

### Step 2: Compile Code

```bash
curl -X POST https://code-backend.fly.dev/api/compile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE" \
  -d '{
    "courseId": "solidity-101",
    "code": "// SPDX-License-Identifier: MIT\n\npragma solidity ^0.8.30;\n\ncontract SimpleStorage {\n    uint256 private storedValue;\n\n    function setValue(uint256 _value) public {\n        storedValue = _value;\n    }\n\n    function getValue() public view returns (uint256) {\n        return storedValue;\n    }\n}",
    "contractName": "SimpleStorage"
  }'
```

## Using the Script

Or use the provided script:

```bash
./test-compile.sh
```

## Expected Response

**Success:**
```json
{
  "success": true,
  "result": {
    "success": true,
    "compiled": true,
    "output": "...",
    "warnings": []
  },
  "courseId": "solidity-101",
  "contractName": "SimpleStorage.sol",
  "timestamp": "2025-11-02T21:45:00.000Z"
}
```

**Error:**
```json
{
  "success": false,
  "result": {
    "success": false,
    "compiled": false,
    "errors": ["..."],
    "warnings": []
  },
  "courseId": "solidity-101",
  "contractName": "SimpleStorage.sol",
  "timestamp": "2025-11-02T21:45:00.000Z"
}
```

## Parameters

- `courseId` (required): Course ID, e.g., "solidity-101"
- `code` (required): Solidity contract code as a string (escape newlines with `\n`)
- `contractName` (optional): Name of the contract, defaults to "CompileContract"

## Notes

- The endpoint requires admin authentication (JWT token)
- The course project directory will be auto-created if it doesn't exist
- Make sure to escape special characters in the code string (newlines, quotes, etc.)
