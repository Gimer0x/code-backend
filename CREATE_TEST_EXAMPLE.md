# How to Create a Challenge Test for a Lesson

## Quick Summary

The backend is **working correctly**. The issue is that **no test file exists in the database** for lesson `cmhezc0nl00119kpm1w9yvxj2` ("Events", Order: 3).

## Admin Endpoint to Create Test

**Endpoint:** `POST /api/lessons/:lessonId/challenge-tests`  
**Authentication:** Required (Admin token)

**Request Body:**
```json
{
  "testFileName": "EventsTest.t.sol",
  "testContent": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.30;\n\nimport {Test, console} from \"forge-std/Test.sol\";\nimport {Events} from \"../src/Events.sol\";\n\ncontract EventsTest is Test {\n    Events public events;\n    \n    function setUp() public {\n        events = new Events();\n    }\n    \n    function testGet() public view {\n        assertEq(events.get(), 0);\n    }\n    \n    function testInc() public {\n        events.inc();\n        assertEq(events.get(), 1);\n    }\n    \n    function testDec() public {\n        events.inc(); // First increment\n        events.dec(); // Then decrement\n        assertEq(events.get(), 0);\n    }\n    \n    function testEvents() public {\n        vm.expectEmit(true, false, false, false);\n        emit Events.Increment(address(this), 1);\n        events.inc();\n        \n        vm.expectEmit(true, false, false, false);\n        emit Events.Decrement(address(this), 0);\n        events.dec();\n    }\n}"
}
```

## Example Using cURL

```bash
curl -X POST http://localhost:3002/api/lessons/cmhezc0nl00119kpm1w9yvxj2/challenge-tests \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "testFileName": "EventsTest.t.sol",
    "testContent": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.30;\n\nimport {Test, console} from \"forge-std/Test.sol\";\nimport {Events} from \"../src/Events.sol\";\n\ncontract EventsTest is Test {\n    Events public events;\n    \n    function setUp() public {\n        events = new Events();\n    }\n    \n    function testGet() public view {\n        assertEq(events.get(), 0);\n    }\n    \n    function testInc() public {\n        events.inc();\n        assertEq(events.get(), 1);\n    }\n    \n    function testDec() public {\n        events.inc();\n        events.dec();\n        assertEq(events.get(), 0);\n    }\n    \n    function testEvents() public {\n        vm.expectEmit(true, false, false, false);\n        emit Events.Increment(address(this), 1);\n        events.inc();\n        \n        vm.expectEmit(true, false, false, false);\n        emit Events.Decrement(address(this), 0);\n        events.dec();\n    }\n}"
  }'
```

## Example Using JavaScript/TypeScript

```typescript
async function createChallengeTest(lessonId: string, adminToken: string) {
  const testContent = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {Events} from "../src/Events.sol";

contract EventsTest is Test {
    Events public events;
    
    function setUp() public {
        events = new Events();
    }
    
    function testGet() public view {
        assertEq(events.get(), 0);
    }
    
    function testInc() public {
        events.inc();
        assertEq(events.get(), 1);
    }
    
    function testDec() public {
        events.inc(); // First increment
        events.dec(); // Then decrement
        assertEq(events.get(), 0);
    }
    
    function testEvents() public {
        vm.expectEmit(true, false, false, false);
        emit Events.Increment(address(this), 1);
        events.inc();
        
        vm.expectEmit(true, false, false, false);
        emit Events.Decrement(address(this), 0);
        events.dec();
    }
}`;

  const response = await fetch(
    `http://localhost:3002/api/lessons/${lessonId}/challenge-tests`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        testFileName: 'EventsTest.t.sol',
        testContent: testContent
      })
    }
  );

  const result = await response.json();
  return result;
}
```

## Response

**Success Response:**
```json
{
  "success": true,
  "test": {
    "id": "test_id",
    "lessonId": "cmhezc0nl00119kpm1w9yvxj2",
    "testFileName": "EventsTest.t.sol",
    "testContent": "...",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  },
  "message": "Challenge test created successfully"
}
```

## Important Notes

1. **Test File Name**: The `testFileName` can be any name, but the backend will use the contract-based name (`EventsTest.t.sol`) when writing to disk.

2. **Test Content**: The test content must:
   - Import the student's contract: `import {Events} from "../src/Events.sol";`
   - Import Foundry test utilities: `import {Test, console} from "forge-std/Test.sol";`
   - Extend `Test` contract
   - Test the contract's functionality

3. **After Creation**: Once the test is created, students can run tests and the backend will:
   - Retrieve this test from the database
   - Write it to disk as `{ContractName}Test.t.sol` (e.g., `EventsTest.t.sol`)
   - Run ONLY this test file (using `--match-path`)

## Verification

After creating the test, verify it was saved:

```bash
# Using Prisma Studio (already running on port 5555)
# Navigate to http://localhost:5555
# Go to ChallengeTest table
# Filter by lessonId: cmhezc0nl00119kpm1w9yvxj2
```

Or check the logs when running a test - you should see:
```
[TEST] Found challenge test: EventsTest.t.sol (ID: ...) for lesson: cmhezc0nl00119kpm1w9yvxj2
```

