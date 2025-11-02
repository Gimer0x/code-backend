# Course Project Auto-Creation Fix

## Problem

When an admin tries to compile code, they get the error:
```
Course project not found: solidity-101
```

This happens because the course exists in the database but the file system project directory doesn't exist.

## Solution

### 1. Auto-Creation in AdminCompilationManager

The `AdminCompilationManager.compileCode()` method now automatically creates the course project directory if it doesn't exist.

**What it does:**
- Checks if `course-{courseId}` directory exists
- If not found, creates the directory
- Initializes it as a Foundry project using `forge init`
- Creates the basic structure (`src/`, `lib/`, `foundry.toml`, etc.)

### 2. Course Verification Script

Created `scripts/check-course.js` to verify course setup:

```bash
# Check a course
npm run check-course solidity-101

# Or via Fly.io
flyctl ssh console --app code-backend -C "npm run check-course solidity-101"
```

**What it checks:**
- ✅ Course exists in database
- ✅ CourseProject record exists
- ✅ File system directory exists
- ✅ Required files exist (foundry.toml, remappings.txt, src/, lib/)

## How It Works

When `AdminCompilationManager.compileCode()` is called:

1. **Check directory exists**: `course-{courseId}` in `FOUNDRY_CACHE_DIR`
2. **If missing**: 
   - Create directory
   - Run `git init` (required for forge)
   - Run `forge init --force .` to initialize Foundry project
   - Continue with compilation
3. **If exists**: Use existing project

## Testing

After deploying:

1. **Test auto-creation**: Try compiling code for a course that doesn't exist yet
2. **Verify directory**: Check that `course-solidity-101` was created
3. **Verify compilation**: Confirm code compiles successfully

## Manual Creation (if needed)

If auto-creation doesn't work, you can manually create the course project:

```bash
# SSH into Fly.io
flyctl ssh console --app code-backend

# Create directory
mkdir -p /app/foundry-projects/course-solidity-101
cd /app/foundry-projects/course-solidity-101

# Initialize git (required for forge)
git init

# Initialize Foundry project
forge init --force .

# Verify structure
ls -la
```

## Course Project Structure

```
foundry-projects/
└── course-{courseId}/
    ├── foundry.toml       # Foundry configuration
    ├── remappings.txt     # Import remappings
    ├── src/               # Source code (contracts go here)
    │   └── {Contract}.sol
    ├── lib/               # Dependencies
    │   ├── forge-std/
    │   └── openzeppelin-contracts/
    └── test/              # Test files
```

## Database vs File System

- **Database**: Course record with CourseProject record
- **File System**: Actual Foundry project directory at `course-{courseId}`

The fix ensures both exist. The database record should already exist (created when the course was created). The file system directory is now auto-created on first use.

## Next Steps

1. **Deploy the updated code** to Fly.io
2. **Test compilation** - it should now auto-create the directory
3. **Verify** using `check-course` script

## Notes

- Auto-creation happens on first compilation attempt
- The directory is persistent (stored in `/app/foundry-projects` volume)
- If `forge init` fails, basic structure is still created
- Existing projects are not modified

