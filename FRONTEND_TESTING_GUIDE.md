# Frontend Student Testing Implementation Guide

## Overview

This guide explains how to implement student code testing functionality in the frontend. The backend automatically:

1. **Saves code to DB first** (DB is the source of truth)
2. **Compiles code first** - tests only run if compilation succeeds
3. **Generates test filename** from contract name: `{ContractName}Test.t.sol`
4. **Runs evaluator tests** - tests created by admin for the lesson
5. **Returns comprehensive results** - compilation warnings, test results, summary

## Testing Flow

```
User clicks "Run Tests"
    ↓
Save code to DB (if not already saved)
    ↓
Backend automatically:
    ↓
1. Compiles code first
    ↓
2a. If compilation fails → Return compilation errors/warnings (NO TESTS RUN)
    ↓
2b. If compilation succeeds → Run tests
    ↓
3. Return test results (passed/failed tests, summary)
```

## Prerequisites

### ⚠️ Important: Code Must Be Saved First

**Option 1: Save code before testing (Recommended)**
```typescript
// Save code first
await saveCode({ courseId, lessonId, files });

// Then run tests (files parameter is optional now)
await runTests({ courseId, lessonId });
```

**Option 2: Save code during test request**
```typescript
// Include files in test request - backend will save them first
await runTests({ courseId, lessonId, files });
```

## API Endpoint

### `POST /api/student/test`

**Base URL:**
- **Direct Backend:** `http://localhost:3002` (backend service port)
- **Via Next.js Proxy:** `http://localhost:3000` (if using Next.js API route proxy)

**⚠️ Important:** If you're getting a 404 error, check:
1. **Backend is running** on port 3002
2. **Frontend is using correct URL** - either call backend directly or use Next.js API route proxy
3. **Next.js API route exists** - if using proxy, ensure you have `/pages/api/student/test.js` or `/app/api/student/test/route.js`

**Authentication:** Required (JWT token in `Authorization` header)

**Request Body:**
```typescript
{
  courseId: string;        // Required
  lessonId: string;        // Required
  files?: Array<{          // Optional - if not provided, uses saved code from DB
    path: string;          // e.g., "src/Challenge.sol"
    content: string;       // Solidity code content
  }>;
  filePath?: string;      // Optional - used for compilation
  solc?: string;          // Optional - Solidity compiler version (default: "0.8.30")
}
```

**Example Request:**
```json
{
  "courseId": "test",
  "lessonId": "lesson123",
  "files": [
    {
      "path": "src/Challenge.sol",
      "content": "contract Events {\n    event LogEvent(address indexed user);\n    function emitEvent(address user) public {\n        emit LogEvent(user);\n    }\n}"
    }
  ],
  "solc": "0.8.30"
}
```

## Response Formats

### Success Response: Tests Executed

**Status:** `200 OK`

**Note:** `success` will be `false` if any tests failed, but this is still a `200 OK` response (tests executed successfully, just some failed).

**Response:**

**Example 1: Some tests failed (success: false, but tests executed)**
```json
{
  "success": false,
  "compilation": {
    "success": true,
    "warnings": []
  },
  "tests": [
    {
      "name": "testInitialZero()",
      "status": "passed",
      "gasUsed": 0,
      "duration": 0
    },
    {
      "name": "testInc()",
      "status": "failed",
      "error": "assertion failed: 0 != 1",
      "gasUsed": 13003,
      "duration": 0
    },
    {
      "name": "testDec()",
      "status": "failed",
      "error": "panic: arithmetic underflow or overflow (0x11)",
      "gasUsed": 10124,
      "duration": 0
    },
    {
      "name": "testUnderflowReverts()",
      "status": "passed",
      "gasUsed": 0,
      "duration": 0
    }
  ],
  "summary": {
    "total": 4,
    "passed": 2,
    "failed": 2
  },
  "testFileName": "EventsTest.t.sol",
  "contractName": "Events",
  "timestamp": "2024-10-31T16:14:00.000Z"
}
```

**Example 2: All tests passed (success: true)**
```json
{
  "success": true,
  "compilation": {
    "success": true,
    "warnings": []
  },
  "tests": [
    {
      "name": "testInitialZero()",
      "status": "passed",
      "gasUsed": 0,
      "duration": 0
    },
    {
      "name": "testInc()",
      "status": "passed",
      "gasUsed": 13003,
      "duration": 0
    }
  ],
  "summary": {
    "total": 2,
    "passed": 2,
    "failed": 0
  },
  "testFileName": "EventsTest.t.sol",
  "contractName": "Events",
  "timestamp": "2024-10-31T16:14:00.000Z"
}
```

**Response Fields:**
- `success`: `false` = some tests failed, `true` = all tests passed
- `compilation.success`: `true` = contract compiled successfully
- `compilation.warnings`: Array of compilation warnings (if any)
- `tests`: Array of individual test results
  - `name`: Test function name (e.g., "testInc()")
  - `status`: "passed" or "failed"
  - `error`: Error message (only present if `status: "failed"`)
  - `gasUsed`: Gas consumed by test (in wei)
  - `duration`: Test execution time (in nanoseconds)
- `summary`: Quick statistics
  - `total`: Total number of tests
  - `passed`: Number of passed tests
  - `failed`: Number of failed tests
- `testFileName`: Name of the test file executed (e.g., "EventsTest.t.sol")
- `contractName`: Name of the contract being tested
- `timestamp`: ISO timestamp of when tests were executed

### Compilation Failed Response

**Status:** `200 OK` (Note: `success: false` but status is 200)

**Response:**
```json
{
  "success": false,
  "error": "Compilation failed",
  "code": "COMPILATION_FAILED",
  "compilation": {
    "success": false,
    "errors": [
      {
        "type": "compilation_error",
        "code": "9576",
        "message": "Invalid syntax...",
        "severity": "error",
        "file": "src/Events.sol",
        "line": 10,
        "column": 5
      }
    ],
    "warnings": []
  }
}
```

**⚠️ Important:** When `code === "COMPILATION_FAILED"`, **NO TESTS ARE RUN**. Only compilation errors/warnings are returned.

### Error Responses

#### No Code Found
**Status:** `400 Bad Request`
```json
{
  "success": false,
  "error": "No code found to test. Please save your code first using PUT /api/student/code",
  "code": "NO_CODE_FOUND"
}
```

#### No Contract Name
**Status:** `400 Bad Request`
```json
{
  "success": false,
  "error": "Could not extract contract name from code",
  "code": "NO_CONTRACT_NAME"
}
```

#### Test Not Found
**Status:** `404 Not Found`
```json
{
  "success": false,
  "error": "Evaluator test not found",
  "code": "TEST_NOT_FOUND"
}
```

#### Timeout
**Status:** `408 Request Timeout`
```json
{
  "success": false,
  "error": "Test timed out"
}
```

#### Server Error
**Status:** `500 Internal Server Error`
```json
{
  "success": false,
  "error": "Test failed"
}
```

## TypeScript Types

```typescript
interface TestRequest {
  courseId: string;
  lessonId: string;
  files?: Array<{
    path: string;
    content: string;
  }>;
  filePath?: string;
  solc?: string;
}

interface CompilationWarning {
  type: string;
  code: string;
  message: string;
  severity: 'warning';
  file?: string;
  line?: number;
  column?: number;
}

interface CompilationError {
  type: string;
  code: string;
  message: string;
  severity: 'error';
  file?: string;
  line?: number;
  column?: number;
}

interface TestResult {
  name: string;
  status: 'passed' | 'failed';
  gasUsed: number;
  duration: number;
  error?: string;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
}

interface TestSuccessResponse {
  success: true;
  compilation: {
    success: true;
    warnings: CompilationWarning[];
  };
  tests: TestResult[];
  summary: TestSummary;
  testFileName: string;
  contractName: string;
  timestamp: string;
}

interface CompilationFailedResponse {
  success: false;
  error: 'Compilation failed';
  code: 'COMPILATION_FAILED';
  compilation: {
    success: false;
    errors: CompilationError[];
    warnings: CompilationWarning[];
  };
}

interface TestFailedResponse {
  success: false;
  compilation: {
    success: true;
    warnings: CompilationWarning[];
  };
  tests: TestResult[];
  summary: TestSummary;
  testFileName: string;
  contractName: string;
  timestamp: string;
}

type TestResponse = TestSuccessResponse | TestFailedResponse | CompilationFailedResponse;
```

## Processing Test Responses in Frontend

### Example: React Component for Displaying Test Results

```typescript
import React, { useState } from 'react';

interface TestDisplayProps {
  result: TestResponse;
}

function TestResultsDisplay({ result }: TestDisplayProps) {
  // Handle compilation failure
  if (result.code === 'COMPILATION_FAILED') {
    return (
      <div className="test-results compilation-error">
        <h3>❌ Compilation Failed</h3>
        <p>Tests cannot run because the code failed to compile.</p>
        <div className="errors">
          {result.compilation.errors.map((error, idx) => (
            <div key={idx} className="error">
              <strong>Error:</strong> {error.message}
              {error.file && (
                <span> in {error.file}:{error.line}:{error.column}</span>
              )}
            </div>
          ))}
        </div>
        {result.compilation.warnings.length > 0 && (
          <div className="warnings">
            <h4>⚠️ Warnings:</h4>
            {result.compilation.warnings.map((warning, idx) => (
              <div key={idx} className="warning">
                {warning.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Handle test execution results
  const { success, tests, summary, compilation } = result;
  
  return (
    <div className={`test-results ${success ? 'all-passed' : 'some-failed'}`}>
      {/* Header */}
      <div className="test-header">
        <h3>
          {success ? '✅ All Tests Passed' : '❌ Some Tests Failed'}
        </h3>
        <div className="test-stats">
          <span className="total">Total: {summary.total}</span>
          <span className="passed">Passed: {summary.passed}</span>
          <span className="failed">Failed: {summary.failed}</span>
        </div>
      </div>

      {/* Compilation warnings */}
      {compilation.warnings.length > 0 && (
        <div className="warnings-section">
          <h4>⚠️ Compilation Warnings:</h4>
          <ul>
            {compilation.warnings.map((warning, idx) => (
              <li key={idx}>
                {warning.message}
                {warning.file && (
                  <span className="location">
                    {' '}({warning.file}:{warning.line}:{warning.column})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Individual test results */}
      <div className="test-list">
        {tests.map((test, idx) => (
          <div
            key={idx}
            className={`test-item ${test.status}`}
          >
            <div className="test-name">
              <span className="status-icon">
                {test.status === 'passed' ? '✅' : '❌'}
              </span>
              <strong>{test.name}</strong>
            </div>
            {test.status === 'failed' && test.error && (
              <div className="test-error">
                <strong>Error:</strong> {test.error}
              </div>
            )}
            {test.gasUsed > 0 && (
              <div className="test-meta">
                Gas used: {test.gasUsed.toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="test-summary">
        <p>
          <strong>Contract:</strong> {result.contractName}
        </p>
        <p>
          <strong>Test File:</strong> {result.testFileName}
        </p>
        <p className="timestamp">
          Executed: {new Date(result.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// Usage example
function LessonView() {
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRunTests = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/student/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          courseId: 'test',
          lessonId: 'cmhezc0nl00119kpm1w9yvxj2'
        })
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      console.error('Test error:', error);
      alert('Failed to run tests');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleRunTests} disabled={loading}>
        {loading ? 'Running Tests...' : 'Run Tests'}
      </button>
      
      {testResult && <TestResultsDisplay result={testResult} />}
    </div>
  );
}
```

### Key Points for Processing:

1. **Check `success` field**: `false` means tests ran but some failed, `true` means all passed
2. **Handle compilation errors**: Check for `code === 'COMPILATION_FAILED'` to show compilation errors
3. **Display individual tests**: Loop through `tests` array to show each test's status
4. **Show errors**: Failed tests have an `error` field with the error message
5. **Show summary**: Use `summary` object for quick stats display
6. **Show warnings**: Display `compilation.warnings` if present

## Implementation Examples

### Example 1: Basic Test Function with Improved Error Handling

**Option A: Direct Backend Call (Port 3002)**
```typescript
async function runTests(
  courseId: string,
  lessonId: string,
  codeContent: string,
  token: string
): Promise<TestResponse> {
  try {
    const response = await fetch('http://localhost:3002/api/student/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        courseId,
        lessonId,
        files: [
          {
            path: 'src/Challenge.sol',
            content: codeContent
          }
        ],
        solc: '0.8.30'
      })
    });

    const result = await response.json();

    // Handle error responses (backend returns JSON even on 404/400)
    if (!response.ok || (!result.success && result.code)) {
      // Map error codes to user-friendly messages
      const errorMessages: Record<string, string> = {
        'TEST_NOT_FOUND': 'No test file found for this lesson. Please contact the administrator.',
        'NO_CODE_FOUND': 'Please save your code first before running tests.',
        'NO_CONTRACT_NAME': 'Could not detect contract name. Please check your contract definition.',
        'COMPILATION_FAILED': 'Compilation failed. Please check the errors above.',
      };

      const errorMessage = errorMessages[result.code] || result.error || 'Test request failed';
      throw new Error(errorMessage);
    }

    return result;
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Failed to connect to the server. Please check if the backend is running.');
    }
    console.error('Test error:', error);
    throw error;
  }
}
```

**Option B: Using Environment Variable (Recommended)**
```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

async function runTests(
  courseId: string,
  lessonId: string,
  codeContent: string,
  token: string
): Promise<TestResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/student/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        courseId,
        lessonId,
        files: [
          {
            path: 'src/Challenge.sol',
            content: codeContent
          }
        ],
        solc: '0.8.30'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Test request failed');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Test error:', error);
    throw error;
  }
}
```

**Option C: Next.js API Route Proxy**

Create `/pages/api/student/test.js` (Pages Router) or `/app/api/student/test/route.js` (App Router):

```typescript
// pages/api/student/test.js (Pages Router)
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3002';
    const response = await fetch(`${backendUrl}/api/student/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': req.headers.authorization || '',
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

Then call from frontend:
```typescript
const response = await fetch('/api/student/test', {

### Example 2: Save First, Then Test (Recommended)

```typescript
async function saveAndTest(
  courseId: string,
  lessonId: string,
  codeContent: string,
  token: string
): Promise<TestResponse> {
  // Step 1: Save code first
  const saveResponse = await fetch('/api/student/code', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      courseId,
      lessonId,
      files: [
        {
          path: 'src/Challenge.sol',
          content: codeContent
        }
      ]
    })
  });

  if (!saveResponse.ok) {
    throw new Error('Failed to save code');
  }

  // Step 2: Run tests (files parameter is optional now since code is saved)
  const testResponse = await fetch('/api/student/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      courseId,
      lessonId,
      solc: '0.8.30'
    })
  });

  if (!testResponse.ok) {
    const error = await testResponse.json();
    throw new Error(error.error || 'Test request failed');
  }

  return await testResponse.json();
}
```

### Example 3: Handle Different Response Scenarios

```typescript
async function handleTestResponse(response: TestResponse) {
  // Check for compilation failure
  if (response.code === 'COMPILATION_FAILED') {
    const compilationResponse = response as CompilationFailedResponse;
    
    console.error('Compilation failed:');
    compilationResponse.compilation.errors.forEach(error => {
      console.error(`Error in ${error.file}:${error.line}: ${error.message}`);
    });
    
    // Show compilation errors to user
    showCompilationErrors(compilationResponse.compilation.errors);
    return;
  }

  // Check for other error codes (handle both 200 and non-200 responses)
  if (!response.success && response.code) {
    switch (response.code) {
      case 'NO_CODE_FOUND':
        showError('Please save your code first before running tests.');
        return;
      case 'NO_CONTRACT_NAME':
        showError('Could not detect contract name in your code. Please check your contract definition.');
        return;
      case 'TEST_NOT_FOUND':
        // More helpful message for TEST_NOT_FOUND
        showError(
          'No test file found for this lesson. The administrator needs to create a test file before tests can be run.',
          'info' // Can use different severity levels
        );
        return;
    }
    return;
  }

  // Handle successful test execution
  const successResponse = response as TestSuccessResponse;
  
  // Show compilation warnings if any
  if (successResponse.compilation.warnings.length > 0) {
    console.warn('Compilation warnings:');
    successResponse.compilation.warnings.forEach(warning => {
      console.warn(`Warning in ${warning.file}:${warning.line}: ${warning.message}`);
    });
    showWarnings(successResponse.compilation.warnings);
  }

  // Display test results
  displayTestResults({
    tests: successResponse.tests,
    summary: successResponse.summary,
    contractName: successResponse.contractName,
    testFileName: successResponse.testFileName
  });
}
```

### Example 4: React Component Example

```typescript
import React, { useState } from 'react';

interface TestResults {
  success: boolean;
  compilation?: {
    success: boolean;
    warnings?: Array<any>;
    errors?: Array<any>;
  };
  tests?: Array<{
    name: string;
    status: 'passed' | 'failed';
    gasUsed: number;
    error?: string;
  }>;
  summary?: {
    total: number;
    passed: number;
    failed: number;
  };
  code?: string;
}

function TestRunner({ courseId, lessonId, codeContent, token }: Props) {
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    setLoading(true);
    setError(null);
    setTestResults(null);

    try {
      const response = await fetch('/api/student/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          courseId,
          lessonId,
          files: [
            {
              path: 'src/Challenge.sol',
              content: codeContent
            }
          ],
          solc: '0.8.30'
        })
      });

      const result = await response.json();

      // Handle 404 and other error responses (backend returns JSON even on 404)
      if (!response.ok) {
        // Check for specific error codes
        if (result.code === 'TEST_NOT_FOUND') {
          setError('No test file found for this lesson. Please contact the administrator.');
        } else if (result.code === 'NO_CODE_FOUND') {
          setError('Please save your code first before running tests.');
        } else if (result.code === 'NO_CONTRACT_NAME') {
          setError('Could not detect contract name in your code. Please check your contract definition.');
        } else {
          setError(result.error || 'Test request failed');
        }
        return;
      }

      // Handle compilation failure (success: false but status 200)
      if (result.code === 'COMPILATION_FAILED') {
        setTestResults({
          success: false,
          compilation: {
            success: false,
            errors: result.compilation.errors,
            warnings: result.compilation.warnings
          },
          code: 'COMPILATION_FAILED'
        });
        return;
      }

      // Handle other error codes (even with 200 status)
      if (!result.success && result.code) {
        switch (result.code) {
          case 'TEST_NOT_FOUND':
            setError('No test file found for this lesson. Please contact the administrator to add a test file.');
            return;
          case 'NO_CODE_FOUND':
            setError('Please save your code first before running tests.');
            return;
          case 'NO_CONTRACT_NAME':
            setError('Could not detect contract name in your code. Please check your contract definition.');
            return;
        }
      }

      // Handle successful test execution
      setTestResults({
        success: result.success,
        compilation: result.compilation,
        tests: result.tests,
        summary: result.summary
      });
    } catch (err) {
      // Network errors or other exceptions
      if (err instanceof TypeError && err.message.includes('fetch')) {
        setError('Failed to connect to the server. Please check if the backend is running.');
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={runTests} disabled={loading}>
        {loading ? 'Running Tests...' : 'Run Tests'}
      </button>

      {error && (
        <div className="error">
          <strong>⚠️ Error:</strong> {error}
          {error.includes('No test file found') && (
            <div className="error-hint">
              <p>This lesson doesn't have a test file yet. The administrator needs to create one.</p>
            </div>
          )}
        </div>
      )}

      {testResults && (
        <div>
          {/* Compilation Errors */}
          {testResults.compilation && !testResults.compilation.success && (
            <div className="compilation-errors">
              <h3>Compilation Errors</h3>
              {testResults.compilation.errors?.map((err, idx) => (
                <div key={idx} className="error">
                  {err.file && `${err.file}:${err.line} - `}
                  {err.message}
                </div>
              ))}
            </div>
          )}

          {/* Compilation Warnings */}
          {testResults.compilation?.warnings && testResults.compilation.warnings.length > 0 && (
            <div className="compilation-warnings">
              <h3>Compilation Warnings</h3>
              {testResults.compilation.warnings.map((warn, idx) => (
                <div key={idx} className="warning">
                  {warn.file && `${warn.file}:${warn.line} - `}
                  {warn.message}
                </div>
              ))}
            </div>
          )}

          {/* Test Results */}
          {testResults.tests && (
            <div className="test-results">
              <h3>Test Results</h3>
              <div className="summary">
                <strong>Total:</strong> {testResults.summary?.total || 0}
                {' | '}
                <strong>Passed:</strong> {testResults.summary?.passed || 0}
                {' | '}
                <strong>Failed:</strong> {testResults.summary?.failed || 0}
              </div>
              <ul>
                {testResults.tests.map((test, idx) => (
                  <li key={idx} className={test.status}>
                    <strong>{test.name}</strong>
                    {' - '}
                    {test.status === 'passed' ? '✓ Passed' : '✗ Failed'}
                    {test.error && ` - ${test.error}`}
                    {test.gasUsed > 0 && ` (Gas: ${test.gasUsed})`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

## Troubleshooting

### Issue 1: 404 Not Found Error

**Problem:** `POST http://localhost:3000/api/student/test 404 (Not Found)`

**Solutions:**

1. **Check backend is running:**
   ```bash
   curl http://localhost:3002/health
   ```

2. **Verify backend port:**
   - Backend runs on port **3002** (not 3000)
   - Frontend should call `http://localhost:3002/api/student/test` directly
   - OR use Next.js API route proxy at `/api/student/test`

3. **Check Next.js API route (if using proxy):**
   - Ensure file exists: `/pages/api/student/test.js` (Pages Router)
   - OR `/app/api/student/test/route.js` (App Router)
   - Verify proxy forwards to `http://localhost:3002`

4. **Check CORS settings:**
   - Backend must allow requests from `http://localhost:3000`
   - Check `CORS_ORIGIN` environment variable

### Issue 2: Test File Not Found

**Problem:** `Error: Test file not found for this lesson` (404 response)

**What this means:**
- The route is working correctly ✅
- The proxy is functioning ✅  
- The backend is responding correctly ✅
- **BUT** no `ChallengeTest` record exists in the database for this lesson

**Why this happens:**
- The lesson doesn't have a test file created yet
- The admin hasn't added an evaluator test for this lesson
- The test file was deleted or not properly linked

**Frontend Handling:**
```typescript
// Handle TEST_NOT_FOUND gracefully
if (result.code === 'TEST_NOT_FOUND') {
  // Show user-friendly message
  setError('No test file found for this lesson. The administrator needs to create one.');
  
  // Optionally: Disable test button or show info message
  // setIsTestAvailable(false);
}
```

**Backend Solution (Admin):**
1. Navigate to lesson edit page in admin panel
2. Add a challenge test file
3. Provide test content (Solidity test file)
4. Save the lesson

**To verify test file exists:**
```sql
SELECT * FROM challenge_tests WHERE lesson_id = 'your-lesson-id';
```

**Note:** This is a **data issue**, not a code/routing issue. The frontend should handle this gracefully and inform the user that the test file is missing.

### Issue 3: Port Configuration

**Environment Variables:**

**Frontend (`.env.local`):**
```env
NEXT_PUBLIC_API_URL=http://localhost:3002
# OR if using proxy:
# NEXT_PUBLIC_API_URL=http://localhost:3000
```

**Backend (`.env`):**
```env
PORT=3002
CORS_ORIGIN=http://localhost:3000
```

## Best Practices

### 1. Always Save Code First

**✅ Recommended:**
```typescript
// Save code first, then test
await saveCode({ courseId, lessonId, files });
await runTests({ courseId, lessonId });
```

**⚠️ Less Recommended:**
```typescript
// Include files in test request (still works, but less explicit)
await runTests({ courseId, lessonId, files });
```

### 2. Handle Compilation Errors Separately

Compilation errors are returned with `code: "COMPILATION_FAILED"` but HTTP status `200`. Always check the `code` field:

```typescript
if (response.code === 'COMPILATION_FAILED') {
  // Show compilation errors - NO TESTS WERE RUN
  showErrors(response.compilation.errors);
  return;
}
```

### 3. Show Compilation Warnings

Even when tests pass, show compilation warnings to the user:

```typescript
if (response.compilation?.warnings?.length > 0) {
  showWarnings(response.compilation.warnings);
}
```

### 4. Display Test Results Clearly

Show:
- **Test summary** (total, passed, failed)
- **Individual test results** (name, status, error if failed)
- **Gas usage** (if available)
- **Contract name** and test file name (for reference)

### 5. Handle Loading States

Testing can take time (compilation + test execution). Show loading indicators:

```typescript
const [loading, setLoading] = useState(false);

// Show spinner/loading message while testing
if (loading) {
  return <div>Running tests...</div>;
}
```

### 6. Handle Timeouts

The backend has a 60-second timeout for tests. Handle timeout errors:

```typescript
try {
  const response = await runTests(...);
} catch (error) {
  if (error.message.includes('timeout') || error.message.includes('TIMEOUT')) {
    alert('Test execution timed out. Please check your code.');
  }
}
```

### 7. Use Contract Name from Response

The backend extracts the contract name and returns it. Use it for display:

```typescript
// Display: "Testing Events contract (EventsTest.t.sol)"
console.log(`Testing ${response.contractName} contract (${response.testFileName})`);
```

## Error Handling Checklist

- [ ] Handle `NO_CODE_FOUND` - prompt user to save code first
- [ ] Handle `NO_CONTRACT_NAME` - prompt user to check contract definition
- [ ] Handle `COMPILATION_FAILED` - show compilation errors (no tests run)
- [ ] Handle `TEST_NOT_FOUND` - inform user test file is missing
- [ ] Handle `TIMEOUT` - inform user test execution timed out
- [ ] Handle network errors - show appropriate error message
- [ ] Handle server errors (500) - show generic error message

## Testing Checklist

Before deploying, verify:

- [ ] Code is saved to DB before testing
- [ ] Compilation errors are shown when compilation fails
- [ ] Compilation warnings are shown even when tests pass
- [ ] Test results are displayed correctly (passed/failed)
- [ ] Test summary shows correct counts
- [ ] Individual test errors are shown for failed tests
- [ ] Loading states are handled during test execution
- [ ] Timeout errors are handled gracefully
- [ ] Contract name is extracted and displayed correctly
- [ ] Test filename format is correct: `{ContractName}Test.t.sol`

## Summary

**Key Points:**

1. ✅ **Save code first** - DB is the source of truth
2. ✅ **Backend compiles automatically** - tests only run if compilation succeeds
3. ✅ **Test filename is auto-generated** - based on contract name: `{ContractName}Test.t.sol`
4. ✅ **Check `code` field** - `COMPILATION_FAILED` means no tests were run
5. ✅ **Always show warnings** - even when tests pass
6. ✅ **Handle all error codes** - for better user experience
7. ✅ **Use correct API URL** - Backend runs on port 3002, or use Next.js proxy
8. ✅ **Ensure test file exists** - Admin must create test file for lesson in database

**Quick Checklist:**
- [ ] Backend is running on port 3002
- [ ] Frontend calls correct URL (3002 or proxy)
- [ ] Test file exists in database for the lesson (admin must create it)
- [ ] Code is saved to DB before testing
- [ ] All error scenarios are handled

The backend handles all the complexity - your frontend just needs to call the endpoint and display the results!

