import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import { StudentWorkspaceManager } from './src/studentWorkspaceManager.js';
import { uploadSingleImage, processImage } from './src/imageUpload.js';
import { CourseService } from './src/courseService.js';
import { ModuleService } from './src/moduleService.js';
import { LessonService } from './src/lessonService.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test output parsing function
function parseTestOutput(output) {
  const results = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    // Look for test results like: [PASS] testInitialCountIsZero() (gas: 7628)
    const passMatch = line.match(/\[PASS\]\s+(\w+)\(\)\s+\(gas:\s+(\d+)\)/);
    const failMatch = line.match(/\[FAIL\]\s+(\w+)\(\)/);
    
    if (passMatch) {
      results.push({
        name: passMatch[1],
        status: 'pass',
        message: `Test passed`,
        gasUsed: parseInt(passMatch[2])
      });
    } else if (failMatch) {
      results.push({
        name: failMatch[1],
        status: 'fail',
        message: `Test failed`,
        gasUsed: 0
      });
    }
  }
  
  // If no results found but output contains test information, try alternative parsing
  if (results.length === 0 && output.includes('test')) {
    // Look for patterns like "testInitialZero()" in the output
    const testMatches = output.match(/test\w+\(\)/g);
    if (testMatches) {
      testMatches.forEach(testName => {
        const isPassed = output.includes(`[PASS] ${testName}`) || output.includes('Suite result: ok');
        results.push({
          name: testName,
          status: isPassed ? 'pass' : 'fail',
          message: isPassed ? 'Test passed' : 'Test failed',
          gasUsed: 0
        });
      });
    }
  }
  
  // If still no results, try to extract from the actual test output format
  if (results.length === 0 && output.includes('[PASS]')) {
    const passMatches = output.match(/\[PASS\]\s+(\w+)\(\)\s+\(gas:\s+(\d+)\)/g);
    if (passMatches) {
      passMatches.forEach(match => {
        const testMatch = match.match(/\[PASS\]\s+(\w+)\(\)\s+\(gas:\s+(\d+)\)/);
        if (testMatch) {
          results.push({
            name: testMatch[1],
            status: 'pass',
            message: 'Test passed',
            gasUsed: parseInt(testMatch[2])
          });
        }
      });
    }
  }
  
  return results;
}

const app = express();
const PORT = process.env.PORT || 3002;

// Initialize paths
const basePath = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, './foundry-projects');
console.log(`🔧 Base path for Foundry projects: ${basePath}`);
const studentSessionsPath = process.env.STUDENT_SESSIONS_DIR || path.join(__dirname, '../student-sessions');

// Initialize Prisma client
const prisma = new PrismaClient();

// Initialize services
const courseService = new CourseService();
const moduleService = new ModuleService();
const lessonService = new LessonService();

// Initialize workspace manager
const workspaceManager = new StudentWorkspaceManager();

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per 15 minutes per IP
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

app.use('/api/', apiLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'dappdojo-foundry',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Compilation endpoint
app.post('/api/compile', async (req, res) => {
  try {
    const { userId, courseId, lessonId, code, contractName } = req.body;

    if (!userId || !courseId || !lessonId || !code) {
      return res.status(400).json({
        success: false,
        error: 'userId, courseId, lessonId, and code are required'
      });
    }

    console.log(`🔧 Compiling code for user ${userId}, course ${courseId}, lesson ${lessonId}`);
    
    // Get or create student workspace
    const workspacePath = await workspaceManager.getOrCreateStudentWorkspace(userId, courseId);
    const isAnonymous = workspaceManager.isAnonymousUser(userId);
    
    // Save lesson code to workspace
    await workspaceManager.saveLessonCode(workspacePath, lessonId, code, contractName || 'StudentContract');
    
    // Create temporary session for compilation
    const sessionId = `compile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const sessionPath = await workspaceManager.createTempSession(workspacePath, sessionId);
    
    // Clean up ALL test files to avoid conflicts with student code
    try {
      const testDir = path.join(sessionPath, 'test');
      const testFiles = await fs.readdir(testDir);
      for (const file of testFiles) {
        if (file.endsWith('.t.sol')) {
          await fs.unlink(path.join(testDir, file));
          console.log(`🧹 Removed test file: ${file}`);
        }
      }
    } catch (error) {
      console.log(`⚠️ Could not clean test files: ${error.message}`);
    }
    
    // Run compilation
    const result = await new Promise((resolve, reject) => {
      const process = spawn('forge', ['build'], {
        cwd: sessionPath,
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr
        });
      });

      process.on('error', (error) => {
        reject(error);
      });
    });

    // Clean up temporary session
    await workspaceManager.cleanupTempSession(sessionPath);

    // Parse errors and warnings from both stdout and stderr
    const errors = [];
    const warnings = [];
    
    // Parse stderr for errors and warnings
    if (result.stderr) {
      const stderrLines = result.stderr.split('\n');
      for (const line of stderrLines) {
        if (line.includes('Error:') || line.includes('error:')) {
          // Extract error details
          const errorMatch = line.match(/Error:\s*(.+)/i);
          if (errorMatch) {
            errors.push({
              type: 'compilation_error',
              message: errorMatch[1].trim(),
              severity: 'error',
              sourceLocation: {
                file: 'src/Counter.sol',
                start: { line: 1, column: 1 }
              }
            });
          }
        } else if (line.includes('Warning:') || line.includes('warning:')) {
          const warningMatch = line.match(/Warning:\s*(.+)/i);
          if (warningMatch) {
            warnings.push({
              type: 'compilation_warning',
              message: warningMatch[1].trim(),
              severity: 'warning',
              sourceLocation: {
                file: 'src/Counter.sol',
                start: { line: 1, column: 1 }
              }
            });
          }
        }
      }
    }
    
    // Parse stdout for warnings (Foundry outputs warnings to stdout)
    if (result.stdout) {
      const stdoutLines = result.stdout.split('\n');
      for (const line of stdoutLines) {
        if (line.includes('Warning (') || line.includes('Warning:')) {
          const warningMatch = line.match(/Warning\s*\([^)]*\):\s*(.+)/i) || line.match(/Warning:\s*(.+)/i);
          if (warningMatch) {
            warnings.push({
              type: 'compilation_warning',
              message: warningMatch[1].trim(),
              severity: 'warning',
              sourceLocation: {
                file: 'src/Counter.sol',
                start: { line: 1, column: 1 }
              }
            });
          }
        }
      }
    }

    // Clean up ephemeral workspace immediately after compilation for all users
    await workspaceManager.cleanupEphemeralWorkspace(workspacePath);

    res.json({
      success: result.success,
      result: {
        success: result.success,
        output: { artifacts: [], compilationTime: null, contracts: [] },
        warnings: warnings,
        errors: result.success ? errors : [...errors, { 
          type: 'compilation_error', 
          message: result.stderr || 'Unknown compilation error',
          severity: 'error',
          sourceLocation: {
            file: 'src/Counter.sol',
            start: { line: 1, column: 1 }
          }
        }],
        timestamp: new Date().toISOString()
      },
      workspaceId: `${userId}-${courseId}`,
      sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Compilation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to compile code'
    });
  }
});

// Testing endpoint
app.post('/api/test', async (req, res) => {
  const requestId = `foundry-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  console.log(`[${requestId}] Starting test request`)
  
  try {
    const { userId, courseId, lessonId, code, testCode, contractName, testName } = req.body;
    console.log(`[${requestId}] Received test request:`, {
      userId,
      courseId,
      lessonId,
      contractName,
      testName,
      codeLength: code?.length || 0,
      testCodeLength: testCode?.length || 0
    })

    if (!userId || !courseId || !lessonId || !code || !testCode) {
      console.log(`[${requestId}] Missing required parameters`)
      return res.status(400).json({
        success: false,
        error: 'userId, courseId, lessonId, code, and testCode are required'
      });
    }

    console.log(`[${requestId}] Testing code for user ${userId}, course ${courseId}, lesson ${lessonId}`);
    
    // Get or create student workspace
    const workspacePath = await workspaceManager.getOrCreateStudentWorkspace(userId, courseId);
    const isAnonymous = workspaceManager.isAnonymousUser(userId);
    console.log(`[${requestId}] Workspace: ${workspacePath}, Anonymous: ${isAnonymous}`)
    
    // Save lesson code to workspace
    await workspaceManager.saveLessonCode(workspacePath, lessonId, code, contractName || 'StudentContract');
    console.log(`[${requestId}] Saved lesson code to workspace`)
    
    // Create temporary session for testing
    const sessionId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const sessionPath = await workspaceManager.createTempSession(workspacePath, sessionId);
    console.log(`[${requestId}] Created temporary session: ${sessionId}`)
    
    // Clean up existing test files to avoid conflicts
    try {
      const testDir = path.join(sessionPath, 'test');
      const existingTests = await fs.readdir(testDir);
      for (const testFile of existingTests) {
        if (testFile.endsWith('.t.sol')) {
          await fs.unlink(path.join(testDir, testFile));
        }
      }
    } catch (error) {
      console.log('No existing test files to clean up');
    }
    
    // Write test code to session
    const testFile = path.join(sessionPath, 'test', `${testName || 'StudentContractTest'}.t.sol`);
    await fs.writeFile(testFile, testCode, 'utf8');
    console.log(`[${requestId}] Written test file: ${testFile}`)
    
    // Run tests
    console.log(`[${requestId}] Running forge test in: ${sessionPath}`)
    const result = await new Promise((resolve, reject) => {
      const process = spawn('forge', ['test'], {
        cwd: sessionPath,
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        console.log(`[${requestId}] Forge test completed with exit code: ${code}`)
        console.log(`[${requestId}] stdout length: ${stdout.length}, stderr length: ${stderr.length}`)
        resolve({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr
        });
      });

      process.on('error', (error) => {
        reject(error);
      });
    });

    // Clean up temporary session
    await workspaceManager.cleanupTempSession(sessionPath);
    console.log(`[${requestId}] Cleaned up temporary session`)

    // Clean up ephemeral workspace immediately after testing for all users
    await workspaceManager.cleanupEphemeralWorkspace(workspacePath);
    console.log(`[${requestId}] Cleaned up ephemeral workspace`)

    // Log the raw output for debugging
    console.log(`[${requestId}] Raw forge test output:`, result.stdout)
    
    // Parse test output to extract structured results
    const parsedResults = parseTestOutput(result.stdout);
    const testCount = parsedResults.length;
    const passedCount = parsedResults.filter(r => r.status === 'pass').length;
    const failedCount = parsedResults.filter(r => r.status === 'fail').length;
    
    console.log(`[${requestId}] Parsed test results:`, {
      testCount,
      passedCount,
      failedCount,
      results: parsedResults.map(r => ({ name: r.name, status: r.status, gasUsed: r.gasUsed }))
    })

    console.log(`[${requestId}] Sending response:`, {
      success: result.success,
      outputLength: result.stdout.length,
      hasErrors: !result.success,
      errorLength: result.stderr.length,
      parsedTestCount: testCount
    })

    res.json({
      success: result.success,
      message: result.success ? 'Tests completed' : 'Tests failed',
      testResults: parsedResults,
      testCount,
      passedCount,
      failedCount,
      testTime: 0, // Could be extracted from output if needed
      result: {
        success: result.success,
        output: result.stdout,
        errors: result.success ? [] : [{ type: 'test_error', message: result.stderr || 'Unknown error', line: 1 }],
        warnings: [],
        timestamp: new Date().toISOString()
      },
      workspaceId: `${userId}-${courseId}`,
      sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[${requestId}] Test error:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to run tests'
    });
  }
});

// Course management endpoints
app.post('/api/courses', async (req, res) => {
  try {
    const { courseId, title, language, goals, level, access, thumbnail, foundryConfig, dependencies, templates, creatorId } = req.body;
    
    console.log(`🔧 Creating course: ${title} (${courseId})`);
    
    // Use a default creator ID if not provided (for now)
    const defaultCreatorId = creatorId || 'admin-user-id';
    
    // Create course in database
    const result = await courseService.createCourse({
      courseId,
      title,
      language,
      goals,
      level,
      access,
      thumbnail,
      foundryConfig,
      dependencies,
      templates
    }, defaultCreatorId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Also create the Foundry project structure
    try {
      const coursePath = path.join(basePath, `course-${courseId}`);
      console.log(`🔧 Creating directory: ${coursePath}`);
      await fs.mkdir(coursePath, { recursive: true });
      
      // Initialize Foundry project
      console.log(`🔧 Initializing Foundry project in: ${coursePath}`);
      const initResult = await new Promise((resolve, reject) => {
        const forge = spawn('forge', ['init', '--force', '.'], {
          cwd: coursePath,
          stdio: 'pipe'
        });
        
        let stdout = '';
        let stderr = '';
        
        forge.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        forge.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        forge.on('close', (code) => {
          console.log(`Forge init completed with code: ${code}`);
          if (stderr) console.log(`🔧 Forge stderr: ${stderr}`);
          resolve({ code, stdout, stderr });
        });
        
        forge.on('error', (error) => {
          console.error(`🔧 Forge error: ${error.message}`);
          reject(error);
        });
      });
      
      // Create foundry.toml with custom configuration
      const foundryToml = generateFoundryToml(foundryConfig || {});
      await fs.writeFile(path.join(coursePath, 'foundry.toml'), foundryToml);
      
      console.log(`✅ Foundry project created at: ${coursePath}`);
      
    } catch (projectError) {
      console.error('❌ Foundry project creation failed:', projectError.message);
      console.error('❌ Error details:', projectError);
      // Don't fail the entire request if project creation fails
    }
    
    res.json({
      success: true,
      message: 'Course created successfully',
      course: result.course,
      project: result.project
    });
    
  } catch (error) {
    console.error('Course creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create course'
    });
  }
});

// Get course by ID
app.get('/api/courses/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const result = await courseService.getCourse(courseId);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List courses
app.get('/api/courses', async (req, res) => {
  try {
    const { page = 1, limit = 10, level, access } = req.query;
    const result = await courseService.listCourses({
      page: parseInt(page),
      limit: parseInt(limit),
      level,
      access
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('List courses error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update course
app.put('/api/courses/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const updateData = req.body;
    
    const result = await courseService.updateCourse(courseId, updateData);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete course
app.delete('/api/courses/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const result = await courseService.deleteCourse(courseId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to generate foundry.toml
function generateFoundryToml(config) {
  const defaultConfig = {
    solc: "0.8.30",
    optimizer: true,
    optimizer_runs: 200,
    via_ir: false,
    evm_version: "london"
  };

  const finalConfig = { ...defaultConfig, ...config };
  
  let toml = '[profile.default]\n';
  toml += `src = "src"\n`;
  toml += `out = "out"\n`;
  toml += `libs = ["lib"]\n`;
  toml += `solc = "${finalConfig.solc}"\n`;
  toml += `optimizer = ${finalConfig.optimizer}\n`;
  toml += `optimizer_runs = ${finalConfig.optimizer_runs}\n`;
  
  if (finalConfig.via_ir !== undefined) {
    toml += `via_ir = ${finalConfig.via_ir}\n`;
  }
  
  if (finalConfig.evm_version) {
    toml += `evm_version = "${finalConfig.evm_version}"\n`;
  }

  return toml;
}

// Workspace management endpoints
app.get('/api/workspaces/:userId/:courseId', async (req, res) => {
  try {
    const { userId, courseId } = req.params;
    const workspacePath = await workspaceManager.getOrCreateStudentWorkspace(userId, courseId);
    const status = await workspaceManager.getWorkspaceStatus(workspacePath);
    
    res.json({
      success: true,
      workspace: {
        id: `${userId}-${courseId}`,
        path: workspacePath,
        status
      }
    });
  } catch (error) {
    console.error('Workspace status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get lesson code from workspace
app.get('/api/workspaces/:userId/:courseId/lessons/:lessonId', async (req, res) => {
  try {
    const { userId, courseId, lessonId } = req.params;
    const workspacePath = await workspaceManager.getOrCreateStudentWorkspace(userId, courseId);
    const code = await workspaceManager.loadLessonCode(workspacePath, lessonId);
    
    res.json({
      success: true,
      lesson: {
        id: lessonId,
        code,
        workspaceId: `${userId}-${courseId}`
      }
    });
  } catch (error) {
    console.error('Load lesson code error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// List all student workspaces
app.get('/api/workspaces', async (req, res) => {
  try {
    const workspaces = await workspaceManager.listStudentWorkspaces();
    
    res.json({
      success: true,
      workspaces,
      total: workspaces.length
    });
  } catch (error) {
    console.error('List workspaces error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clean up old workspaces (maintenance endpoint)
app.post('/api/workspaces/cleanup', async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;
    await workspaceManager.cleanupOldWorkspaces(daysOld);
    
    res.json({
      success: true,
      message: `Cleaned up workspaces older than ${daysOld} days`
    });
  } catch (error) {
    console.error('Cleanup workspaces error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Image upload endpoints
app.post('/api/upload/course-thumbnail', uploadSingleImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

    console.log(`📸 Processing course thumbnail: ${req.file.originalname}`);
    
    // Process the image
    const imagePath = await processImage(req.file.buffer, req.file.originalname);
    
    res.json({
      success: true,
      message: 'Image uploaded successfully',
      imagePath: imagePath,
      filename: path.basename(imagePath),
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload image'
    });
  }
});

// Module management endpoints
app.post('/api/courses/:courseId/modules', async (req, res) => {
  try {
    const { courseId } = req.params;
    const moduleData = { ...req.body, courseId };
    
    const result = await moduleService.createModule(moduleData);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Create module error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/courses/:courseId/modules', async (req, res) => {
  try {
    const { courseId } = req.params;
    const result = await moduleService.listModules(courseId);
    
    res.json(result);
    
  } catch (error) {
    console.error('List modules error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/modules/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const result = await moduleService.getModule(moduleId);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Get module error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put('/api/modules/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const updateData = req.body;
    
    const result = await moduleService.updateModule(moduleId, updateData);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Update module error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/modules/:moduleId', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const result = await moduleService.deleteModule(moduleId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Delete module error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Lesson management endpoints
app.post('/api/modules/:moduleId/lessons', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const lessonData = { ...req.body, moduleId };
    
    const result = await lessonService.createLesson(lessonData);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Create lesson error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/modules/:moduleId/lessons', async (req, res) => {
  try {
    const { moduleId } = req.params;
    const result = await lessonService.listLessons(moduleId);
    
    res.json(result);
    
  } catch (error) {
    console.error('List lessons error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/lessons/:lessonId', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const result = await lessonService.getLesson(lessonId);
    
    if (!result.success) {
      return res.status(404).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Get lesson error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put('/api/lessons/:lessonId', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const updateData = req.body;
    
    const result = await lessonService.updateLesson(lessonId, updateData);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Update lesson error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/lessons/:lessonId', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const result = await lessonService.deleteLesson(lessonId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Delete lesson error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Challenge test management
app.post('/api/lessons/:lessonId/challenge-tests', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const testData = { ...req.body, lessonId };
    
    const result = await lessonService.createChallengeTest(testData);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Create challenge test error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Quiz question management
app.post('/api/lessons/:lessonId/quiz-questions', async (req, res) => {
  try {
    const { lessonId } = req.params;
    const questionData = { ...req.body, lessonId };
    
    const result = await lessonService.createQuizQuestion(questionData);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Create quiz question error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Start the server
app.listen(PORT, () => {
  console.log(`Foundry service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Features: Solidity compilation, Foundry testing`);
});