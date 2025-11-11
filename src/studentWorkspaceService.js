import { prisma, prismaQuery } from './prismaClient.js';
import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';

function getCourseRoot() {
  let dir = process.env.COURSE_WORKSPACE_DIR;
  // If not set or set to root /courses (invalid - no write permission), use project-relative path
  if (!dir || dir === '/courses') {
    dir = path.join(process.cwd(), 'courses');
  }
  return dir;
}

function getStudentDir(courseId, studentId) {
  return path.join(getCourseRoot(), courseId, 'students', studentId);
}

function getSharedLibDir(courseId) {
  return path.join(getCourseRoot(), courseId, 'lib');
}

function getTemplatesDir(courseId) {
  return path.join(getCourseRoot(), courseId, 'templates');
}

function getTestsDir(courseId) {
  return path.join(getCourseRoot(), courseId, 'tests');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function pathExists(p) {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function copyDir(src, dest) {
  await ensureDir(dest);
  if (fs.cp) {
    await fs.cp(src, dest, { recursive: true });
  } else {
    // Fallback shallow copy
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(s, d);
      } else if (entry.isFile()) {
        await fs.copyFile(s, d);
      }
    }
  }
}

async function ensureSharedLib(courseId) {
  const libDir = getSharedLibDir(courseId);
  if (await pathExists(libDir)) return;
  await ensureDir(libDir);

  // Preferred source: the Foundry project created for this course
  const foundryRoot = process.env.FOUNDRY_CACHE_DIR || path.join(process.cwd(), 'foundry-projects');
  const courseFoundryLib = path.join(foundryRoot, `course-${courseId}`, 'lib');

  // Fallback source: ops-provided template directory
  const envSource = process.env.COURSE_LIB_SOURCE_DIR;

  const candidateSources = [courseFoundryLib, envSource].filter(Boolean);
  const candidates = ['forge-std', 'openzeppelin-contracts'];

  for (const source of candidateSources) {
    try {
      for (const name of candidates) {
        const srcPath = path.join(source, name);
        if (await pathExists(srcPath)) {
          const destPath = path.join(libDir, name);
          await copyDir(srcPath, destPath);
        }
      }
      // If we copied at least one library, we're good
      if ((await pathExists(path.join(libDir, 'forge-std'))) || (await pathExists(path.join(libDir, 'openzeppelin-contracts')))) {
        return;
      }
    } catch {}
  }

  // If nothing was copied, surface a clear error
  throw new Error('Shared lib bootstrap failed: no source found for forge-std/openzeppelin-contracts');
}

async function writeFoundryToml(studentDir, solc = '0.8.30') {
  // Lib directory is at: courses/{courseId}/lib
  // Student directory is at: courses/{courseId}/students/{studentId}
  // So from student directory, we need ../../lib to reach courses/{courseId}/lib
  // OR ../lib to reach courses/{courseId}/students/lib (if lib was in students folder)
  // Since lib is OUTSIDE students folder, we use ../../lib
  const toml = [
    '[profile.default]',
    'src = "src"',
    'out = "out"',
    'libs = ["../../lib"]',  // From students/studentId to courses/courseId/lib
    `solc = "${solc}"`,
    'optimizer = true',
    'optimizer_runs = 200',
  ].join('\n');
  await fs.writeFile(path.join(studentDir, 'foundry.toml'), toml);
}

/**
 * Extract contract name from Solidity code
 * @param {string} code - Solidity source code
 * @returns {string|null} Contract name or null if not found
 */
function extractContractName(code) {
  if (!code || typeof code !== 'string') return null;
  
  // Remove comments to avoid false matches
  const withoutComments = code
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* ... */ comments
    .replace(/\/\/.*$/gm, ''); // Remove // comments
  
  // Match: contract ContractName { or contract ContractName is ...
  // Also handle: abstract contract, interface, library
  // Priority order: contract > abstract contract > interface > library
  const patterns = [
    /contract\s+(\w+)(?:\s+is\s+[^{]+|\s*\{)/, // contract Events is IERC20 { or contract Events {
    /abstract\s+contract\s+(\w+)(?:\s+is\s+[^{]+|\s*\{)/, // abstract contract Events {
    /interface\s+(\w+)(?:\s+is\s+[^{]+|\s*\{)/, // interface IEvents {
    /library\s+(\w+)(?:\s+is\s+[^{]+|\s*\{)/, // library EventsLib {
  ];
  
  for (const pattern of patterns) {
    const match = withoutComments.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

async function copyTemplate(courseId, exerciseId, studentDir) {
  const srcDir = path.join(studentDir, 'src');
  await ensureDir(srcDir);
  const templateDir = path.join(getTemplatesDir(courseId), exerciseId);
  // Check if template directory exists before trying to read it
  if (!(await pathExists(templateDir))) {
    return; // No template available, silently skip
  }
  try {
    const entries = await fs.readdir(templateDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.sol')) {
        const content = await fs.readFile(path.join(templateDir, entry.name));
        await fs.writeFile(path.join(srcDir, entry.name), content);
      }
    }
  } catch (e) {
    // ignore if read fails
    console.warn(`Template copy warning for ${exerciseId}:`, e.message);
  }
}

function guardStudentPath(studentDir, filePath) {
  const resolved = path.resolve(studentDir, filePath);
  if (!resolved.startsWith(studentDir)) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

async function runForge(cwd, args, timeoutMs = 30000) {
  return await new Promise((resolve, reject) => {
    const child = spawn('forge', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('TIMEOUT'));
    }, timeoutMs);
    child.stdout.on('data', d => (stdout += d.toString()))
    child.stderr.on('data', d => (stderr += d.toString()))
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export class StudentWorkspaceService {
  static async initWorkspace(userId, { courseId, exerciseId, mode = 'ensure', useTemplate = true, solc }) {
    const studentDir = getStudentDir(courseId, userId);
    // Ensure shared lib exists (read-only bootstrap if configured)
    await ensureSharedLib(courseId);
    await ensureDir(studentDir);
    await ensureDir(path.join(studentDir, 'src'));
    await ensureDir(path.join(studentDir, 'test'));
    await writeFoundryToml(studentDir, solc);
    if (mode === 'reset') {
      // wipe src/test
      const srcDir = path.join(studentDir, 'src');
      const testDir = path.join(studentDir, 'test');
      try {
        const srcFiles = await fs.readdir(srcDir);
        await Promise.all(srcFiles.map(f => fs.unlink(path.join(srcDir, f))));
      } catch {}
      try {
        const testFiles = await fs.readdir(testDir);
        await Promise.all(testFiles.map(f => fs.unlink(path.join(testDir, f))));
      } catch {}
    }
    if (useTemplate && exerciseId) {
      await copyTemplate(courseId, exerciseId, studentDir);
    }
    const files = await fs.readdir(path.join(studentDir, 'src')).catch(() => []);
    return { success: true, workspacePath: studentDir, files };
  }

  static async saveCode(userId, { courseId, lessonId, files }) {
    // Persist StudentProgress and StudentFile rows
    const savedFiles = [];
    for (const f of files || []) {
      // Extract contract name from code to use as filename
      const contractName = extractContractName(f.content);
      const originalPath = f.path || 'src/Contract.sol';
      const dir = path.dirname(originalPath); // e.g., "src" or "test"
      
      // Determine filename: use contract name if found, otherwise use original filename
      let fileName;
      let filePath;
      
      if (contractName) {
        // Use contract name as filename (e.g., "Events.sol")
        fileName = `${contractName}.sol`;
        filePath = path.join(dir, fileName).replace(/\\/g, '/'); // Ensure forward slashes
      } else {
        // Fallback to original filename if no contract name found
        fileName = path.basename(originalPath);
        filePath = originalPath;
      }
      
      const existing = await prisma.studentProgress.upsert({
        where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
        create: { userId, courseId, lessonId, codeContent: f.content, lastSavedAt: new Date() },
        update: { codeContent: f.content, lastSavedAt: new Date() }
      });
      const savedFile = await prisma.studentFile.upsert({
        where: { studentProgressId_fileName: { studentProgressId: existing.id, fileName: fileName } },
        create: { studentProgressId: existing.id, fileName: fileName, filePath: filePath, content: f.content, fileType: 'contract' },
        update: { content: f.content, filePath: filePath },
        select: { id: true, fileName: true, filePath: true, fileType: true, isMain: true }
      });
      savedFiles.push(savedFile);
    }
    return { success: true, files: savedFiles };
  }

  static async upsertFilesOnDisk(userId, { courseId, files }) {
    const studentDir = getStudentDir(courseId, userId);
    await ensureDir(studentDir);
    for (const f of files || []) {
      // Extract contract name from code to ensure correct filename
      const contractName = extractContractName(f.content);
      let filePath = f.path || 'src/Contract.sol';
      
      if (contractName) {
        // Use contract name as filename (e.g., "Events.sol")
        const dir = path.dirname(filePath); // e.g., "src" or "test"
        const fileName = `${contractName}.sol`;
        filePath = path.join(dir, fileName).replace(/\\/g, '/'); // Ensure forward slashes
      }
      
      const target = guardStudentPath(studentDir, filePath);
      await ensureDir(path.dirname(target));
      await fs.writeFile(target, f.content ?? '');
    }
    return { success: true };
  }

  static async compileFile(userId, { courseId, lessonId, filePath, solc }) {
    // Always retrieve files from DB to ensure consistency
    // Frontend should save code first using PUT /api/student/code
    const savedProgress = await prisma.studentProgress.findUnique({
      where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
      include: { studentFiles: true }
    });

    let files = [];

    if (savedProgress && savedProgress.studentFiles && savedProgress.studentFiles.length > 0) {
      // Use saved files from DB - this is the source of truth
      files = savedProgress.studentFiles.map(sf => ({
        path: sf.filePath || `src/${sf.fileName}`,
        content: sf.content
      }));
    } else {
      // No saved files - fallback to lesson's initialCode (first time compile)
      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        select: { initialCode: true }
      });
      if (lesson?.initialCode) {
        // Parse initialCode (could be single string or JSON array)
        try {
          const parsed = JSON.parse(lesson.initialCode);
          if (Array.isArray(parsed)) {
            files = parsed;
          } else {
            files = [{ path: filePath || 'src/Contract.sol', content: lesson.initialCode }];
          }
        } catch {
          files = [{ path: filePath || 'src/Contract.sol', content: lesson.initialCode }];
        }
      } else {
        return { 
          success: false, 
          error: 'No code found to compile. Please save your code first using PUT /api/student/code', 
          code: 'NO_CODE_FOUND' 
        };
      }
    }

    if (!files || files.length === 0) {
      return { success: false, error: 'No files to compile', code: 'NO_FILES' };
    }

    // Ensure shared lib exists BEFORE writing files (needed for imports)
    await ensureSharedLib(courseId);
    
    const studentDir = getStudentDir(courseId, userId);
    const testDir = path.join(studentDir, 'test');
    
    // Temporarily hide test files during compilation to prevent Foundry from scanning them
    // Foundry's --contracts flag should only compile specified file, but it still resolves imports
    // from all files including test files, which can cause errors if test files import forge-std
    // but lib is not set up correctly
    const hiddenTestFiles = [];
    let testFilesHidden = false;
    try {
      if (await pathExists(testDir)) {
        const testFiles = await fs.readdir(testDir);
        for (const file of testFiles) {
          if (file.endsWith('.sol') || file.endsWith('.t.sol')) {
            const filePath = path.join(testDir, file);
            const hiddenPath = path.join(testDir, `.${file}.hidden`);
            await fs.rename(filePath, hiddenPath);
            hiddenTestFiles.push({ original: filePath, hidden: hiddenPath, name: file });
            testFilesHidden = true;
          }
        }
        // Test files temporarily hidden during compilation
      }
    } catch (hideError) {
      console.warn(`[COMPILE] Warning: Could not hide test files (non-fatal):`, hideError.message);
    }
    
    let res;
    try {
      // Write files to disk in courses/ folder (student workspace)
      await this.upsertFilesOnDisk(userId, { courseId, files });
      await writeFoundryToml(studentDir, solc);
      
      // Determine which file to compile (use provided filePath or first file)
      // IMPORTANT: Only compile contract files, NOT test files
      const targetFile = filePath || (files[0]?.path || 'src/Contract.sol');
      
      // Ensure we're compiling a file in src/, not test/
      if (targetFile.startsWith('test/')) {
        throw new Error('Cannot compile test files directly. Please compile the contract file.');
      }
      
      // Normalize to src/ path if not already
      const rel = targetFile.startsWith('src/') ? targetFile : `src/${path.basename(targetFile)}`;
      
      // Verify lib directory exists and has forge-std
      const libDir = getSharedLibDir(courseId);
      const forgeStdPath = path.join(libDir, 'forge-std');
      if (!(await pathExists(forgeStdPath))) {
        console.error(`[COMPILE] Warning: forge-std not found in ${libDir}, attempting to create lib...`);
        try {
          await ensureSharedLib(courseId);
          // Verify again
          if (!(await pathExists(forgeStdPath))) {
            throw new Error(`forge-std library not found. Shared lib directory: ${libDir}`);
          }
        } catch (libError) {
          throw new Error(`Failed to create shared lib: ${libError.message}`);
        }
      }
      
      // Compile ONLY the specified contract file (not test files)
      // Use --contracts to limit compilation to specific file only
      // This flag tells Foundry to ONLY compile the specified file and its dependencies
      // Use --force to prevent Foundry from using cached compilation results
      // This ensures we always compile the latest code from disk
      res = await runForge(studentDir, ['build', '--force', '--json', '--contracts', rel]);
      
    } finally {
      // Restore test files after compilation (even if compilation fails)
      if (testFilesHidden && hiddenTestFiles.length > 0) {
        try {
          for (const fileInfo of hiddenTestFiles) {
            if (await pathExists(fileInfo.hidden)) {
              await fs.rename(fileInfo.hidden, fileInfo.original);
            }
          }
        } catch (restoreError) {
          console.warn(`[COMPILE] Warning: Could not restore test files:`, restoreError.message);
        }
      }
    }
    
    // Parse compilation output (adapted from AdminCompilationManager)
    let parsedOutput = null;
    let allErrors = [];
    let allWarnings = [];
    
    // Parse stdout (JSON output or text fallback)
    if (res.stdout) {
      try {
        parsedOutput = JSON.parse(res.stdout);
        
        // Foundry JSON output has an 'errors' array with severity field
        // Extract ALL warnings - Foundry includes all warnings with severity: 'warning'
        if (parsedOutput.errors && Array.isArray(parsedOutput.errors)) {
          // Extract errors and warnings from JSON - ensure we get ALL items
          const jsonErrors = parsedOutput.errors.filter(e => e.severity === 'error');
          const jsonWarnings = parsedOutput.errors.filter(e => e.severity === 'warning');
          
          // Convert JSON warning objects to our format
          for (const warn of jsonWarnings) {
            const warning = {
              type: 'compilation_warning',
              code: warn.errorCode || warn.code || '',
              message: warn.message || warn.formattedMessage || '',
              severity: 'warning',
              source: 'json'
            };
            
            // Prioritize formattedMessage for accurate line numbers (it has the actual line)
            // Foundry's formattedMessage has format: "Warning: ...\n  --> src/file.sol:line:column"
            if (warn.formattedMessage) {
              const locationMatch = warn.formattedMessage.match(/-->\s*(.+\.sol):(\d+):(\d+)/);
              if (locationMatch) {
                warning.file = locationMatch[1];
                warning.line = parseInt(locationMatch[2]);
                warning.column = parseInt(locationMatch[3]);
              }
            }
            
            // Fallback to sourceLocation if formattedMessage parsing failed
            if (!warning.file && warn.sourceLocation) {
              warning.file = warn.sourceLocation.file || warn.sourceLocation.fileName;
              // Don't use start/end as line numbers - they're character offsets
              // Only use if line/column are explicitly provided
              if (warn.sourceLocation.line !== undefined) {
                warning.line = warn.sourceLocation.line;
              }
              if (warn.sourceLocation.column !== undefined) {
                warning.column = warn.sourceLocation.column;
              }
            }
            
            allWarnings.push(warning);
          }
          
          // Convert JSON error objects to our format
          for (const err of jsonErrors) {
            const error = {
              type: 'compilation_error',
              code: err.errorCode || err.code || '',
              message: err.message || err.formattedMessage || '',
              severity: 'error',
              source: 'json'
            };
            
            // Prioritize formattedMessage for accurate line numbers (it has the actual line)
            // Foundry's formattedMessage has format: "Error: ...\n  --> src/file.sol:line:column"
            if (err.formattedMessage) {
              const locationMatch = err.formattedMessage.match(/-->\s*(.+\.sol):(\d+):(\d+)/);
              if (locationMatch) {
                error.file = locationMatch[1];
                error.line = parseInt(locationMatch[2]);
                error.column = parseInt(locationMatch[3]);
              }
            }
            
            // Fallback to sourceLocation if formattedMessage parsing failed
            if (!error.file && err.sourceLocation) {
              error.file = err.sourceLocation.file || err.sourceLocation.fileName;
              // Don't use start/end as line numbers - they're character offsets
              // Only use if line/column are explicitly provided
              if (err.sourceLocation.line !== undefined) {
                error.line = err.sourceLocation.line;
              }
              if (err.sourceLocation.column !== undefined) {
                error.column = err.sourceLocation.column;
              }
            }
            
            allErrors.push(error);
          }
        }
      } catch (parseError) {
        // If JSON parsing fails, treat stdout as text and parse it
        parsedOutput = { raw: res.stdout };
        // Parse text output for errors and warnings
        allErrors.push(...this.parseErrors(res.stdout));
        allWarnings.push(...this.parseWarnings(res.stdout));
      }
    }
    
    // Parse stderr (often contains warnings/errors as text)
    if (res.stderr) {
      try {
        // Check if stderr contains JSON
        const stderrParsed = JSON.parse(res.stderr);
        if (stderrParsed.errors && Array.isArray(stderrParsed.errors)) {
          allErrors.push(...stderrParsed.errors.filter(e => e.severity === 'error'));
          allWarnings.push(...stderrParsed.errors.filter(e => e.severity === 'warning'));
        }
      } catch {
        // stderr is plain text - use comprehensive parsing methods
        const stderrErrors = this.parseErrors(res.stderr);
        const stderrWarnings = this.parseWarnings(res.stderr);
        
        allErrors.push(...stderrErrors);
        allWarnings.push(...stderrWarnings);
        
        // If no structured warnings/errors found in stderr and stderr has content, check for general errors
        if (stderrErrors.length === 0 && stderrWarnings.length === 0 && res.stderr.trim()) {
          // Only add as general error if it doesn't look like informational output
          if (!res.stderr.includes('Compiler run successful') && 
              !res.stderr.includes('No warnings') &&
              !res.stderr.includes('Compiler run successful with warnings')) {
            allErrors.push({ 
              message: res.stderr, 
              severity: 'error',
              type: 'stderr_message',
              source: 'stderr'
            });
          }
        }
      }
    }
    
    // Deduplicate errors and warnings (adapted from AdminCompilationManager)
    // Note: Use less aggressive deduplication to ensure all unique warnings are captured
    const errors = this.deduplicateErrors(allErrors);
    const warnings = this.deduplicateWarnings(allWarnings);
    
    // Success is determined by:
    // 1. Forge exit code should be 0
    // 2. No actual errors in the parsed output (warnings don't count as failures)
    // Foundry can sometimes return code 0 but still have errors in JSON output
    const success = res.code === 0 && errors.length === 0;
    
    // Clean up parsedOutput to avoid duplication - remove warnings from output.errors
    // since we're separating them into the warnings field
    let cleanedOutput = parsedOutput;
    if (parsedOutput && parsedOutput.errors && Array.isArray(parsedOutput.errors)) {
      cleanedOutput = {
        ...parsedOutput,
        errors: parsedOutput.errors.filter(e => e.severity === 'error')
      };
    }
    
    // Persist compilation result with warnings
    const sp = await prisma.studentProgress.upsert({
      where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
      create: { userId, courseId, lessonId },
      update: {}
    });
    
    await prisma.compilationResult.create({
      data: { 
        studentProgressId: sp.id, 
        success: success,
        output: cleanedOutput || null,
        errors: errors.length > 0 ? errors : null,
        warnings: warnings.length > 0 ? warnings : null
      }
    });
    
    // Return clean, non-duplicated response structure
    // Structure:
    // - success: boolean
    // - errors: array of error objects (authoritative)
    // - warnings: array of warning objects (authoritative)
    // - output: compilation artifacts only (contracts, ABI, bytecode) - NO errors/warnings
    // - raw: raw stdout/stderr for debugging (optional)
    return { 
      success: success,
      errors: errors,
      warnings: warnings,
      // Output: Only compilation artifacts (contracts, ABI, bytecode), exclude errors/warnings
      output: cleanedOutput ? (() => {
        const { errors: _, ...rest } = cleanedOutput; // Remove errors array
        return rest;
      })() : null,
      // Raw data for debugging (optional - frontend can ignore this)
      raw: process.env.NODE_ENV === 'development' ? {
        stdout: res.stdout, 
        stderr: res.stderr
      } : undefined
    };
  }

  static async testFile(userId, { courseId, lessonId, files, testFileFromDB, filePath, solc }) {
    // Step 1: Save code to DB first (DB is source of truth)
    if (files && files.length > 0) {
      await this.saveCode(userId, { courseId, lessonId, files });
    }

    // Step 2: Get contract name from saved code (for test file naming)
    const savedProgress = await prisma.studentProgress.findUnique({
      where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
      include: { studentFiles: true }
    });

    if (!savedProgress || !savedProgress.studentFiles || savedProgress.studentFiles.length === 0) {
      return {
        success: false,
        error: 'No code found to test. Please save your code first using PUT /api/student/code',
        code: 'NO_CODE_FOUND'
      };
    }

    // Extract contract name from saved code
    const mainFile = savedProgress.studentFiles.find(f => f.isMain) || savedProgress.studentFiles[0];
    const contractName = extractContractName(mainFile.content);
    
    if (!contractName) {
      return {
        success: false,
        error: 'Could not extract contract name from code',
        code: 'NO_CONTRACT_NAME'
      };
    }

    // Step 3: Compile code first
    const compileResult = await this.compileFile(userId, { courseId, lessonId, filePath, solc });

    // Step 4: If compilation fails (has errors), return compilation errors/warnings
    if (!compileResult.success || (compileResult.errors && compileResult.errors.length > 0)) {
      // Don't run tests if compilation has errors
      return {
        success: false,
        error: 'Compilation failed',
        code: 'COMPILATION_FAILED',
        compilation: {
          success: compileResult.success,
          errors: compileResult.errors || [],
          warnings: compileResult.warnings || []
        }
      };
    }

    // Step 5: If compilation succeeds (or has warnings), run tests
    // Generate test filename from contract name: {ContractName}Test.t.sol
    const testFileName = `${contractName}Test.t.sol`;

    // Get evaluator test from DB
    if (!testFileFromDB) {
      // First, try to get test from ChallengeTest table (preferred)
      let test = await prisma.challengeTest.findFirst({ 
        where: { lessonId },
        include: {
          lesson: {
            select: {
              id: true,
              title: true,
              order: true,
              module: {
                select: {
                  id: true,
                  title: true,
                  order: true
                }
              }
            }
          }
        }
      });
      
      // If not found in ChallengeTest table, check Lesson.tests field (fallback for legacy data)
      if (!test) {
        const lesson = await prisma.lesson.findUnique({
          where: { id: lessonId },
          select: {
            id: true,
            title: true,
            order: true,
            tests: true,  // Check legacy tests field
            challengeTests: {
              select: { id: true, testFileName: true, createdAt: true }
            }
          }
        });
        
        if (!lesson) {
          console.error(`[TEST] Lesson not found: ${lessonId}`);
          return {
            success: false,
            error: `Lesson not found: ${lessonId}`,
            code: 'LESSON_NOT_FOUND'
          };
        }
        
        // If test exists in Lesson.tests field, use it (legacy support)
        if (lesson.tests && lesson.tests.trim().length > 0) {
          // Extract test filename from contract name
          // Try to extract contract name from test content (e.g., "contract EventsTest")
          const testContractMatch = lesson.tests.match(/contract\s+(\w+)/);
          let testContractName = testContractMatch ? testContractMatch[1] : contractName;
          
          // If contract name already ends with "Test", use it directly; otherwise append "Test"
          // Example: "EventsTest" -> "EventsTest.t.sol" (not "EventsTestTest.t.sol")
          if (!testContractName.endsWith('Test')) {
            testContractName = `${testContractName}Test`;
          }
          const legacyTestFileName = `${testContractName}.t.sol`;
          
          testFileFromDB = {
            testFileName: legacyTestFileName,
            testContent: lesson.tests
          };
        } else {
          // No test found in either location
          console.error(`[TEST] No challenge test found for lesson: ${lessonId} (Title: ${lesson.title}, Order: ${lesson.order})`);
          console.error(`[TEST] Lesson has ${lesson.challengeTests.length} test(s) in ChallengeTest table`);
          console.error(`[TEST] Lesson.tests field: ${lesson.tests ? 'has content' : 'empty/null'}`);
          
          if (lesson.challengeTests.length > 0) {
            console.error(`[TEST] Available tests in ChallengeTest table:`, lesson.challengeTests.map(t => ({ id: t.id, fileName: t.testFileName })));
          }
          
          return {
            success: false,
            error: 'Evaluator test not found',
            code: 'TEST_NOT_FOUND',
            debug: {
              lessonId,
              lessonExists: true,
              lessonTitle: lesson.title,
              challengeTestsCount: lesson.challengeTests.length,
              hasLegacyTestsField: !!lesson.tests
            }
          };
        }
      } else {
        // Test found in ChallengeTest table (preferred)
        testFileFromDB = {
          testFileName: test.testFileName,
          testContent: test.testContent
        };
      }
    }

    const studentDir = getStudentDir(courseId, userId);
    await ensureDir(path.join(studentDir, 'test'));

    // Ensure shared lib exists BEFORE running tests (needed for test file imports like forge-std)
    await ensureSharedLib(courseId);
    
    // Verify lib directory exists and has forge-std (required for test files)
    const libDir = getSharedLibDir(courseId);
    const forgeStdPath = path.join(libDir, 'forge-std');
    if (!(await pathExists(forgeStdPath))) {
      console.error(`[TEST] Warning: forge-std not found in ${libDir}, attempting to create lib...`);
      try {
        await ensureSharedLib(courseId);
        // Verify again
        if (!(await pathExists(forgeStdPath))) {
          return {
            success: false,
            error: `forge-std library not found. Shared lib directory: ${libDir}. Test files require forge-std to compile.`,
            code: 'LIB_NOT_FOUND',
            compilation: {
              success: compileResult.success,
              warnings: compileResult.warnings || []
            }
          };
        }
      } catch (libError) {
        return {
          success: false,
          error: `Failed to create shared lib: ${libError.message}`,
          code: 'LIB_CREATION_FAILED',
          compilation: {
            success: compileResult.success,
            warnings: compileResult.warnings || []
          }
        };
      }
    }

    // Write evaluator test file to disk
    // Note: The test file name from DB might be different, but we use contract-based name for actual file
    const targetTest = path.join(studentDir, 'test', testFileName);
    await fs.writeFile(targetTest, testFileFromDB.testContent, 'utf8');

    // Clean up any existing test files with different names to avoid conflicts
    try {
      const testDir = path.join(studentDir, 'test');
      const testFiles = await fs.readdir(testDir);
      for (const file of testFiles) {
        if (file.endsWith('.t.sol') && file !== testFileName) {
          await fs.unlink(path.join(testDir, file));
        }
      }
    } catch (error) {
      // Test directory might not exist or cleanup might fail, continue anyway
    }

    // Step 6: Run tests
    // IMPORTANT: Use --match-path to run ONLY this specific test file (not all tests)
    const testStartTime = Date.now();
    const testRes = await runForge(studentDir, ['test', '--json', '--match-path', `test/${testFileName}`], 60000);
    const testTime = Date.now() - testStartTime;

    // Step 7: Parse test results (similar to adminTestManager)
    // Check if output looks like compilation errors (not JSON)
    const isCompilationError = testRes.code !== 0 && 
      (testRes.stdout.includes('Compiler run') || 
       testRes.stdout.includes('Error:') ||
       testRes.stderr.includes('Error:') ||
       !testRes.stdout.trim().startsWith('{'));
    
    if (isCompilationError) {
      console.warn(`[TEST] Test file failed to compile. stdout: ${testRes.stdout.substring(0, 200)}...`);
      console.warn(`[TEST] stderr: ${testRes.stderr}`);
      
      // Extract compilation errors from output
      const compilationErrors = this.extractCompilationErrors(testRes.stdout, testRes.stderr);
      
      return {
        success: false,
        error: 'Test file failed to compile. Cannot run tests.',
        code: 'TEST_COMPILATION_FAILED',
        compilation: {
          success: compileResult.success,
          warnings: compileResult.warnings || []
        },
        testCompilation: {
          success: false,
          errors: compilationErrors,
          stdout: testRes.stdout,
          stderr: testRes.stderr
        },
        summary: {
          total: 0,
          passed: 0,
          failed: 0
        },
        timestamp: new Date().toISOString()
      };
    }
    
    const parsedTestResult = this.parseTestResult(testRes);
    
    // If exit code is non-zero but parsing says success, override it (exit code is authoritative)
    // Exit code 0 = all tests passed, exit code != 0 = tests failed or error
    if (testRes.code !== 0 && parsedTestResult.success) {
      console.warn(`[TEST] Warning: Exit code ${testRes.code} but parsed result says success=true. Overriding to success=false.`);
      parsedTestResult.success = false;
      // Also check if we have failed tests in summary
      if (parsedTestResult.summary && parsedTestResult.summary.failed === 0) {
        // If exit code is non-zero but no failed tests in summary, add a general error
        parsedTestResult.summary.failed = 1;
        parsedTestResult.tests = parsedTestResult.tests || [];
        if (parsedTestResult.tests.length === 0) {
          parsedTestResult.tests.push({
            name: 'Test execution error',
            status: 'failed',
            error: `Test execution failed with exit code ${testRes.code}`,
            stderr: testRes.stderr
          });
        }
      }
    }

    // Step 8: Persist test result to DB
    const sp = await prisma.studentProgress.findUnique({
      where: { userId_courseId_lessonId: { userId, courseId, lessonId } }
    });

    await prisma.testResult.create({
      data: {
        studentProgressId: sp.id,
        success: parsedTestResult.success,
        output: parsedTestResult,
        errors: parsedTestResult.summary.failed > 0 ? parsedTestResult.tests.filter(t => t.status === 'failed') : null,
        testCount: parsedTestResult.summary.total,
        passedCount: parsedTestResult.summary.passed,
        failedCount: parsedTestResult.summary.failed,
        testTime: testTime
      }
    });

    // Step 9: Return comprehensive test result
    return {
      success: parsedTestResult.success,
      compilation: {
        success: compileResult.success,
        warnings: compileResult.warnings || []
      },
      tests: parsedTestResult.tests,
      summary: parsedTestResult.summary,
      testFileName: testFileName,
      contractName: contractName,
      timestamp: parsedTestResult.timestamp
    };
  }

  /**
   * Parse test results from forge test output (adapted from AdminTestManager)
   * @param {Object} result - Raw test result from forge
   * @returns {Object} Parsed test result
   */
  static parseTestResult(result) {
    const { code, stdout, stderr } = result;
    
    // Try to parse JSON output regardless of success/failure
    // Forge test --json outputs JSON even when tests fail
    try {
      if (!stdout || stdout.trim().length === 0) {
        throw new Error('Empty stdout');
      }
      const testData = JSON.parse(stdout);
      const parsed = this.parseJsonTestResult(testData);
      return parsed;
    } catch (error) {
      console.warn(`[TEST] Failed to parse stdout as JSON: ${error.message}`);
      // If JSON parsing fails, try stderr as well
      try {
        if (stderr && stderr.trim().length > 0) {
          const testData = JSON.parse(stderr);
          const parsed = this.parseJsonTestResult(testData);
          return parsed;
        }
      } catch (stderrError) {
        // Fallback to text parsing
      }
      
      // Fallback to text parsing if JSON parsing fails
      return this.parseTextTestResult(stdout, stderr, code);
    }
  }

  /**
   * Parse JSON test results (adapted from AdminTestManager)
   * @param {Object} testData - JSON test data from forge
   * @returns {Object} Parsed result
   */
  static parseJsonTestResult(testData) {
    const tests = [];
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    // Handle the actual forge test JSON format
    for (const [testContract, contractData] of Object.entries(testData)) {
      if (contractData.test_results) {
        for (const [testName, testResult] of Object.entries(contractData.test_results)) {
          totalTests++;
          
          const test = {
            name: testName,
            status: testResult.status === 'Success' ? 'passed' : 'failed',
            gasUsed: testResult.kind?.Unit?.gas || 0,
            duration: testResult.duration || 0
          };

          if (testResult.status === 'Success') {
            passedTests++;
          } else {
            failedTests++;
            test.error = testResult.reason || 'Test failed';
            test.status = 'failed';
          }

          tests.push(test);
        }
      }
    }

    return {
      success: failedTests === 0,
      tests: tests,
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Parse text test results (fallback) (adapted from AdminTestManager)
   * @param {string} stdout - Standard output
   * @param {string} stderr - Standard error
   * @param {number} exitCode - Exit code from forge command
   * @returns {Object} Parsed result
   */
  static parseTextTestResult(stdout, stderr, exitCode = 0) {
    const tests = [];
    const allLines = (stdout || '').split('\n').concat((stderr || '').split('\n'));
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    for (const line of allLines) {
      // Match test result lines
      const passMatch = line.match(/Test result: ok\. (\d+) passed/);
      const failMatch = line.match(/Test result: FAILED\. (\d+) passed; (\d+) failed/);
      
      if (passMatch) {
        passedTests = parseInt(passMatch[1]);
        totalTests = passedTests;
        failedTests = 0;
      } else if (failMatch) {
        passedTests = parseInt(failMatch[1]);
        failedTests = parseInt(failMatch[2]);
        totalTests = passedTests + failedTests;
      }
      
      // Try to extract individual test failures
      const failTestMatch = line.match(/\[FAIL\]\s+(\w+)/);
      if (failTestMatch) {
        tests.push({
          name: failTestMatch[1],
          status: 'failed',
          error: line.trim()
        });
        if (failedTests === 0) {
          failedTests = 1; // At least one failure found
        }
      }
    }
    
    // If exit code is non-zero and we couldn't parse test results, assume failure
    if (exitCode !== 0 && totalTests === 0) {
      failedTests = 1;
      totalTests = 1;
      tests.push({
        name: 'Test execution failed',
        status: 'failed',
        error: stderr || stdout || `Test execution failed with exit code ${exitCode}`
      });
    }

    return {
      success: failedTests === 0 && exitCode === 0,
      tests: tests.length > 0 ? tests : undefined,
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Extract compilation errors from test compilation output
   * @param {string} stdout - Standard output
   * @param {string} stderr - Standard error
   * @returns {Array} Array of compilation errors
   */
  static extractCompilationErrors(stdout, stderr) {
    const errors = [];
    const allLines = (stdout || '').split('\n').concat((stderr || '').split('\n'));
    
    let currentError = null;
    for (const line of allLines) {
      // Match error lines
      if (line.includes('Error:') || line.includes('error:')) {
        if (currentError) {
          errors.push(currentError);
        }
        currentError = {
          message: line.trim(),
          severity: 'error',
          source: 'test_compilation'
        };
      } else if (currentError && line.trim()) {
        // Append to current error message
        currentError.message += '\n' + line.trim();
      }
      
      // Match file locations (e.g., " --> test/EventsTest.t.sol:4:5:")
      const locationMatch = line.match(/-->\s+(.+):(\d+):(\d+):/);
      if (locationMatch && currentError) {
        currentError.file = locationMatch[1];
        currentError.line = parseInt(locationMatch[2]);
        currentError.column = parseInt(locationMatch[3]);
      }
    }
    
    if (currentError) {
      errors.push(currentError);
    }
    
    // If no structured errors found, create a general one
    if (errors.length === 0) {
      errors.push({
        message: stdout || stderr || 'Test file compilation failed',
        severity: 'error',
        source: 'test_compilation'
      });
    }
    
    return errors;
  }

  static async getProgress(userId, { courseId, lessonId }) {
    const sp = await prisma.studentProgress.findUnique({
      where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
      include: { compilationResults: { orderBy: { createdAt: 'desc' }, take: 1 }, testResults: { orderBy: { createdAt: 'desc' }, take: 1 }, studentFiles: true }
    });
    if (!sp) return { success: true, codeContent: null, isCompleted: false, lastSavedAt: null };
    return {
      success: true,
      codeContent: sp.codeContent,
      isCompleted: sp.isCompleted,
      lastSavedAt: sp.lastSavedAt,
      lastCompilation: sp.compilationResults?.[0] || null,
      lastTest: sp.testResults?.[0] || null,
      files: sp.studentFiles
    };
  }

  static async resetToInitialCode(userId, { courseId, lessonId, exerciseId }) {
    // Fetch lesson's initialCode from database
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { initialCode: true }
    });
    
    if (!lesson) {
      return { success: false, error: 'Lesson not found', code: 'LESSON_NOT_FOUND' };
    }

    const initialCode = lesson.initialCode || '';

    // Get student's saved progress and files BEFORE deleting (so we know which files to delete from disk)
    const sp = await prisma.studentProgress.findUnique({
      where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
      select: { 
        id: true,
        studentFiles: {
          select: { fileName: true }
        }
      }
    });

    // Store list of files that belonged to this lesson (for workspace cleanup)
    const lessonFiles = sp?.studentFiles || [];

    if (sp) {
      // Delete related records (Cascade handles this, but explicit for clarity)
      await prisma.studentFile.deleteMany({ where: { studentProgressId: sp.id } });
      await prisma.compilationResult.deleteMany({ where: { studentProgressId: sp.id } });
      await prisma.testResult.deleteMany({ where: { studentProgressId: sp.id } });
      // Delete the progress record itself
      await prisma.studentProgress.delete({ where: { userId_courseId_lessonId: { userId, courseId, lessonId } } });
    }

    // Reset workspace files to template if exerciseId provided
    // NOTE: We only reset files that belong to this specific lesson (based on saved StudentFiles)
    // to avoid affecting other lessons in the same course
    if (exerciseId) {
      const studentDir = getStudentDir(courseId, userId);
      try {
        // Verify course root directory exists and is writable
        const courseRoot = getCourseRoot();
        const courseBase = path.join(courseRoot, courseId);
        
        // Check if course root exists - if not, skip workspace reset (non-fatal)
        if (!(await pathExists(courseRoot))) {
          console.warn(`Workspace reset skipped: course root ${courseRoot} does not exist`);
          // Continue - DB reset already succeeded, return initialCode
        } else {
          // Ensure student directory structure exists
          await ensureDir(studentDir);
          await ensureDir(path.join(studentDir, 'src'));
          
          // Only delete files that were tracked for this specific lesson
          // This prevents affecting other lessons in the same course
          const srcDir = path.join(studentDir, 'src');
          if (lessonFiles.length > 0) {
            // Delete only the specific files that belonged to this lesson
            for (const file of lessonFiles) {
              const filePath = path.join(srcDir, file.fileName);
              await fs.unlink(filePath).catch(() => {}); // Ignore if file doesn't exist
            }
          } else if (sp) {
            // If we had a progress record but no files tracked, this is odd but safe to skip file deletion
            // (might be first time reset before any files were saved)
          }
          
          // Copy template if available (for this exercise)
          await copyTemplate(courseId, exerciseId, studentDir);
        }
      } catch (e) {
        // Non-fatal error - log but continue with returning initialCode from DB
        console.warn('Workspace reset warning (workspace files not reset, but DB reset succeeded):', e.message);
      }
    }

    // Parse initialCode if it's stored as JSON (multiple files), otherwise return as single file
    let files = [];
    try {
      const parsed = JSON.parse(initialCode);
      if (Array.isArray(parsed)) {
        files = parsed;
      } else {
        files = [{ path: 'src/Contract.sol', content: initialCode }];
      }
    } catch {
      // Not JSON, treat as single file content
      if (initialCode) {
        files = [{ path: 'src/Contract.sol', content: initialCode }];
      }
    }

    return {
      success: true,
      initialCode,
      files,
      message: 'Reset to initial code successful'
    };
  }

  /**
   * Parse compilation errors from text output (adapted from AdminCompilationManager)
   * @param {string} output - Standard output or error output
   * @returns {Array} List of errors
   */
  static parseErrors(output) {
    if (!output) return [];
    const errors = [];
    const lines = output.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match Solidity error format: "Error (1234): Error message"
      const errorMatch = line.match(/Error\s*\((\d+)\):\s*(.+)/);
      if (errorMatch) {
        const error = {
          type: 'compilation_error',
          code: errorMatch[1],
          message: errorMatch[2].trim(),
          line: i + 1,
          severity: 'error'
        };
        
        // Look ahead for file location in next lines
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j];
          if (nextLine.includes('-->') && nextLine.includes('.sol:')) {
            const locationMatch = nextLine.match(/-->\s*(.+\.sol):(\d+):(\d+)/);
            if (locationMatch) {
              error.file = locationMatch[1];
              error.line = parseInt(locationMatch[2]);
              error.column = parseInt(locationMatch[3]);
              break;
            }
          }
        }
        
        errors.push(error);
        continue;
      }
      
      // Match Solidity error format: "Error: Compiler run failed:" followed by detailed errors
      if (line.includes('Error: Compiler run failed:')) {
        // This is a general error message, look for specific errors in following lines
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          const nextLine = lines[j];
          const specificErrorMatch = nextLine.match(/Error\s*\((\d+)\):\s*(.+)/);
          if (specificErrorMatch) {
            const error = {
              type: 'compilation_error',
              code: specificErrorMatch[1],
              message: specificErrorMatch[2].trim(),
              line: j + 1,
              severity: 'error'
            };
            
            // Look for file location in next lines
            for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
              const locationLine = lines[k];
              if (locationLine.includes('-->') && locationLine.includes('.sol:')) {
                const locationMatch = locationLine.match(/-->\s*(.+\.sol):(\d+):(\d+)/);
                if (locationMatch) {
                  error.file = locationMatch[1];
                  error.line = parseInt(locationMatch[2]);
                  error.column = parseInt(locationMatch[3]);
                  break;
                }
              }
            }
            
            errors.push(error);
          }
        }
        continue;
      }
      
      // Match simple error format: "Error: ..."
      if (line.includes('Error:') || line.includes('error:')) {
        const error = {
          type: 'compilation_error',
          message: line.replace(/Error:\s*/i, '').trim(),
          line: i + 1,
          severity: 'error'
        };
        
        // Look ahead for file location
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j];
          if (nextLine.includes('-->') && nextLine.includes('.sol:')) {
            const locationMatch = nextLine.match(/-->\s*(.+\.sol):(\d+):(\d+)/);
            if (locationMatch) {
              error.file = locationMatch[1];
              error.line = parseInt(locationMatch[2]);
              error.column = parseInt(locationMatch[3]);
              break;
            }
          }
        }
        
        errors.push(error);
        continue;
      }
    }
    
    return errors;
  }

  /**
   * Parse compilation warnings from text output (adapted from AdminCompilationManager)
   * @param {string} output - Standard output or error output
   * @returns {Array} List of warnings
   */
  static parseWarnings(output) {
    if (!output) return [];
    const warnings = [];
    const lines = output.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match Solidity warning format: "Warning (5667): Unused function parameter..."
      const warningMatch = line.match(/Warning\s*\((\d+)\):\s*(.+)/);
      if (warningMatch) {
        const warning = {
          type: 'compilation_warning',
          code: warningMatch[1],
          message: warningMatch[2].trim(),
          line: i + 1,
          severity: 'warning'
        };
        
        // Look ahead for file location in next lines
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j];
          if (nextLine.includes('-->') && nextLine.includes('.sol:')) {
            const locationMatch = nextLine.match(/-->\s*(.+\.sol):(\d+):(\d+)/);
            if (locationMatch) {
              warning.file = locationMatch[1];
              warning.line = parseInt(locationMatch[2]);
              warning.column = parseInt(locationMatch[3]);
              break;
            }
          }
        }
        
        warnings.push(warning);
        continue;
      }
      
      // Match simple warning format: "Warning: ..."
      if (line.includes('Warning:') || line.includes('warning:')) {
        warnings.push({
          type: 'compilation_warning',
          message: line.replace(/Warning:\s*/i, '').trim(),
          line: i + 1,
          severity: 'warning'
        });
        continue;
      }
    }
    
    return warnings;
  }

  /**
   * Deduplicate errors based on file, line, column, and message (adapted from AdminCompilationManager)
   * @param {Array} errors - Array of error objects
   * @returns {Array} Deduplicated errors
   */
  static deduplicateErrors(errors) {
    if (!errors || errors.length === 0) return [];
    const seen = new Set();
    return errors.filter(error => {
      const key = `${error.file || ''}-${error.line || ''}-${error.column || ''}-${error.message || ''}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Deduplicate warnings based on file, line, column, and message (adapted from AdminCompilationManager)
   * @param {Array} warnings - Array of warning objects
   * @returns {Array} Deduplicated warnings
   */
  static deduplicateWarnings(warnings) {
    if (!warnings || warnings.length === 0) return [];
    const seen = new Set();
    return warnings.filter(warning => {
      const key = `${warning.file || ''}-${warning.line || ''}-${warning.column || ''}-${warning.message || ''}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

// safe JSON parse helper
JSON.parseSafe = (s) => {
  try { return JSON.parse(s); } catch { return null; }
};

export default StudentWorkspaceService;


