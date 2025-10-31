# Frontend File Naming Guide

## Important Change: Automatic Filename Extraction from Contract Name

The backend now **automatically extracts the contract name from your Solidity code** and uses it as the filename. This means:

- ✅ You can send any filename (e.g., `"src/Challenge.sol"`)
- ✅ Backend extracts the contract name (e.g., `"Events"`) from the code
- ✅ Backend saves it with the correct filename (e.g., `"src/Events.sol"`)

## What Changed

### Before:
- Frontend sends: `{ path: "src/Challenge.sol", content: "contract Events {...}" }`
- Backend saves: `fileName: "Challenge.sol"` (uses filename from frontend)

### After:
- Frontend sends: `{ path: "src/Challenge.sol", content: "contract Events {...}" }`
- Backend extracts: contract name = `"Events"` from code
- Backend saves: `fileName: "Events.sol"`, `filePath: "src/Events.sol"` (uses contract name)

## Impact on Frontend

### ✅ No Breaking Changes Required

The change is **mostly transparent** - your existing code should continue to work. However, there are some **best practices** to follow:

### 1. Don't Rely on the Filename You Send

**❌ Wrong:**
```typescript
// Don't assume the filename you send is what's saved
const filename = "src/Challenge.sol";
await saveCode({
  path: filename,
  content: "contract Events {...}"
});
// filename is NOT "Challenge.sol" - it's "Events.sol"!
```

**✅ Correct:**
```typescript
// Use the filename from the backend response
const response = await saveCode({
  path: "src/Challenge.sol", // Can be any filename
  content: "contract Events {...}"
});

// Get the actual filename from the backend
const progress = await getProgress({ courseId, lessonId });
const actualFile = progress.files?.[0];
const actualFilename = actualFile.fileName; // "Events.sol"
const actualPath = actualFile.filePath; // "src/Events.sol"
```

### 2. Use Backend Filename for References

When referencing files (e.g., for compilation or display), use the **filename returned from the backend**:

```typescript
// ✅ CORRECT: Use filename from backend
async function compileFile(courseId, lessonId) {
  // First, get the actual saved filename from backend
  const progress = await getProgress({ courseId, lessonId });
  const savedFile = progress.files?.[0];
  
  if (!savedFile) {
    throw new Error('No file found');
  }
  
  // Use the actual filename/path from backend
  const result = await compile({
    courseId,
    lessonId,
    filePath: savedFile.filePath // Use "src/Events.sol" from backend
  });
  
  return result;
}
```

### 3. Display Actual Filename to User

When displaying the filename to the user, use the **filename from the backend**:

```typescript
// ✅ CORRECT: Display actual filename from backend
function FileDisplay({ courseId, lessonId }) {
  const [file, setFile] = useState(null);
  
  useEffect(() => {
    async function loadFile() {
      const progress = await getProgress({ courseId, lessonId });
      const savedFile = progress.files?.[0];
      setFile(savedFile);
    }
    loadFile();
  }, [courseId, lessonId]);
  
  if (!file) return <div>Loading...</div>;
  
  // Display the actual filename from backend
  return (
    <div>
      <h3>File: {file.fileName}</h3> {/* Shows "Events.sol", not "Challenge.sol" */}
      <p>Path: {file.filePath}</p> {/* Shows "src/Events.sol" */}
    </div>
  );
}
```

## API Response Changes

### `PUT /api/student/code` Response

The response now returns the **actual saved files with their filenames** (based on contract name):

**Request:**
```json
{
  "courseId": "test",
  "lessonId": "lesson123",
  "files": [
    {
      "path": "src/Challenge.sol",
      "content": "contract Events {\n    // ...\n}"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "files": [
    {
      "id": "file123",
      "fileName": "Events.sol",        // ✅ Actual filename (from contract name)
      "filePath": "src/Events.sol",   // ✅ Actual path (from contract name)
      "fileType": "contract",
      "isMain": false
    }
  ]
}
```

**Note:** 
- The filename saved in the DB is `"Events.sol"` (extracted from contract name), not `"Challenge.sol"` (from request)
- You can use the `files` array from the response to get the actual filename immediately

### `GET /api/student/progress` Response

This endpoint returns the **actual saved filename** from the database:

**Response:**
```json
{
  "success": true,
  "codeContent": "contract Events {...}",
  "files": [
    {
      "id": "file123",
      "fileName": "Events.sol",        // ✅ Actual filename (from contract name)
      "filePath": "src/Events.sol",   // ✅ Actual path (from contract name)
      "content": "contract Events {...}",
      "fileType": "contract",
      "isMain": true
    }
  ],
  "lastCompilation": {...},
  "lastTest": {...}
}
```

## Contract Name Extraction Rules

The backend extracts the contract name using these rules (in priority order):

1. `contract ContractName {` or `contract ContractName is BaseContract {`
2. `abstract contract ContractName {`
3. `interface InterfaceName {`
4. `library LibraryName {`

**Examples:**
```solidity
// Extracts: "Events"
contract Events {
    // ...
}

// Extracts: "Events"
contract Events is IERC20 {
    // ...
}

// Extracts: "BaseContract"
abstract contract BaseContract {
    // ...
}

// Extracts: "IEvents"
interface IEvents {
    // ...
}

// Extracts: "EventsLib"
library EventsLib {
    // ...
}
```

**Note:** If no contract/interface/library is found, the backend falls back to using the filename from your request.

## Migration Checklist

- [ ] **No immediate action required** - existing code should work
- [ ] When displaying filenames, use `progress.files[].fileName` from backend
- [ ] When referencing files (compilation, testing), use `progress.files[].filePath` from backend
- [ ] Don't hardcode filenames based on what you send
- [ ] Test that filenames match the contract name in your code

## Example: Complete Save and Compile Flow

```typescript
// ✅ COMPLETE EXAMPLE: Save and compile with correct filename handling

async function saveAndCompile(courseId, lessonId, codeContent) {
  // Step 1: Save code (filename in request doesn't matter)
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
          path: 'src/Challenge.sol', // Can be any filename
          content: codeContent // Contains "contract Events {...}"
        }
      ]
    })
  });
  
  const saveResult = await saveResponse.json();
  
  // ✅ Get the actual saved filename from the save response
  const savedFile = saveResult.files?.[0];
  
  if (!savedFile) {
    throw new Error('File not saved');
  }
  
  // Step 2: Compile using the actual filename from save response
  const compileResponse = await fetch('/api/student/compile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      courseId,
      lessonId,
      filePath: savedFile.filePath, // Use "src/Events.sol" from save response
      solc: '0.8.30'
    })
  });
  
  const compileResult = await compileResponse.json();
  
  return {
    filename: savedFile.fileName, // "Events.sol"
    filePath: savedFile.filePath, // "src/Events.sol"
    compilation: compileResult
  };
}
```

**Alternative:** If you prefer to get the file from `getProgress`:

```typescript
// ✅ ALTERNATIVE: Use getProgress to get saved files

async function saveAndCompile(courseId, lessonId, codeContent) {
  // Step 1: Save code
  await fetch('/api/student/code', {
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
  
  // Step 2: Get the actual saved filename from backend
  const progressResponse = await fetch(`/api/student/progress?courseId=${courseId}&lessonId=${lessonId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const progress = await progressResponse.json();
  const savedFile = progress.files?.[0];
  
  if (!savedFile) {
    throw new Error('File not found');
  }
  
  // Step 3: Compile using the actual filename from backend
  const compileResponse = await fetch('/api/student/compile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      courseId,
      lessonId,
      filePath: savedFile.filePath, // Use "src/Events.sol" from backend
      solc: '0.8.30'
    })
  });
  
  const compileResult = await compileResponse.json();
  
  return {
    filename: savedFile.fileName, // "Events.sol"
    filePath: savedFile.filePath, // "src/Events.sol"
    compilation: compileResult
  };
}
```

## Summary

**✅ Good News:**
- No breaking changes required
- Your existing code should work
- Backend automatically handles filename extraction
- `PUT /api/student/code` now returns the saved files with actual filenames

**⚠️ Best Practices:**
- Use `saveResult.files[].fileName` or `progress.files[].fileName` when displaying filenames
- Use `saveResult.files[].filePath` or `progress.files[].filePath` when referencing files
- Don't hardcode filenames based on what you send

**📝 Key Takeaway:**
The filename you send in the request doesn't matter - the backend extracts the contract name from your code and uses that as the filename. Always use the filename returned from the backend (`PUT /api/student/code` response or `GET /api/student/progress`) for displaying or referencing files.

