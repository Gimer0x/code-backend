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
import { prisma, prismaQuery, initializePrisma } from './src/prismaClient.js';
import { uploadSingleImage, processImage } from './src/imageUpload.js';
import { CourseService } from './src/courseService.js';
import { ModuleService } from './src/moduleService.js';
import { LessonService } from './src/lessonService.js';
import { AuthService } from './src/authService.js';
import { AuthMiddleware } from './src/authMiddleware.js';
import { AdminCompilationManager } from './src/adminCompilationManager.js';
import { AdminTestManager } from './src/adminTestManager.js';
import AIService from './src/aiService.js';
import StudentWorkspaceService from './src/studentWorkspaceService.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();
const PORT = process.env.PORT || 3002;

// Initialize paths
const basePath = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, './foundry-projects');
const studentSessionsPath = process.env.STUDENT_SESSIONS_DIR || path.join(__dirname, '../student-sessions');

// Prisma client is initialized in src/prismaClient.js
// All services now use the shared Prisma client instance

// Initialize services
const courseService = new CourseService();
const moduleService = new ModuleService();
const lessonService = new LessonService();
const adminCompilationManager = new AdminCompilationManager();
const adminTestManager = new AdminTestManager();


// Middleware
app.use(helmet());

// Trust proxy (required for Fly.io and rate limiting)
// Trust only Fly.io's proxy (more secure than trust: true)
// Fly.io uses X-Forwarded-For header from their proxy
app.set('trust proxy', 1); // Trust only the first proxy (Fly.io)

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(compression());

// Stripe webhook endpoint needs raw body BEFORE json parser
// This must be BEFORE express.json() middleware
app.post('/api/user-auth/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const rawBody = req.body; // This is now the raw buffer
    
    console.log('[Stripe Webhook] Received event, signature:', signature ? 'present' : 'missing');
    
    const result = await AuthService.handleStripeWebhook(rawBody, signature);
    
    console.log('[Stripe Webhook] Result:', result.status, result.body?.success ? 'success' : 'error');
    
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    res.status(500).json({ success: false, error: 'Webhook error', details: error.message });
  }
});

// JSON parser for all other routes
app.use(express.json());

// Rate limiting (tunable, and relaxed in development)
const isDev = (process.env.NODE_ENV || 'development') !== 'production';
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || (isDev ? 2000 : 100)),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later',
  skip: (req) => {
    if (isDev) return true; // disable limiter in development
    // Allowlist common, idempotent fetches that are heavily used by the UI
    const p = req.path || '';
    const m = req.method || 'GET';
    if (m === 'GET' && (
      p.startsWith('/api/courses') ||
      p.startsWith('/api/modules') ||
      p.startsWith('/api/lessons') ||
      p === '/api/auth/profile'
    )) {
      return true;
    }
    return false;
  }
});

app.use('/api/', apiLimiter);
// Per-user student operations limiter
const studentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => (req.user?.id || req.ip),
  message: 'Too many requests, please slow down.'
});

// Per-user AI limiter (stricter)
const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => (req.user?.id || req.ip),
  message: 'Too many AI requests, please slow down.'
});

// Health check endpoint with database connection test
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await prismaQuery(() => prisma.$queryRaw`SELECT 1`);
    res.json({ 
      status: 'healthy',
      service: 'dappdojo-foundry',
      database: 'connected',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error.message);
    res.status(503).json({ 
      status: 'unhealthy',
      service: 'dappdojo-foundry',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }
});

// Authentication endpoints
// User auth (separate namespace from admin)
app.post('/api/user-auth/google', async (req, res) => {
  try {
    const result = await AuthService.googleLogin(req.body);
    const status = result.success ? 200 : (result.code?.includes('MISSING') ? 400 : 401);
    res.status(status).json(result);
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ success: false, error: 'Google auth failed', code: 'GOOGLE_AUTH_FAILED' });
  }
});

app.get('/api/user-auth/session', AuthMiddleware.optionalAuth, async (req, res) => {
  try {
    if (!req.user) {
      return res.json({ success: true, isAnonymous: true });
    }
    return res.json({ success: true, isAnonymous: false, user: req.user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get session' });
  }
});

app.post('/api/user-auth/subscribe/start', AuthMiddleware.authenticateToken, async (req, res) => {
  try {
    const result = await AuthService.startSubscriptionCheckout(req.user.id, req.body || {});
    const status = result.success ? 200 : 400;
    res.status(status).json(result);
  } catch (error) {
    console.error('Start subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to start subscription', code: 'SUBSCRIPTION_START_FAILED' });
  }
});

// Webhook endpoint moved above - defined before express.json() middleware

app.get('/api/user-auth/subscription', AuthMiddleware.authenticateToken, async (req, res) => {
  try {
    const result = await AuthService.getSubscriptionStatus(req.user.id);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ success: false, error: 'Failed to get subscription', code: 'SUBSCRIPTION_STATUS_FAILED' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await AuthService.register(req.body);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      code: 'REGISTRATION_FAILED'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await AuthService.login(req.body);
    
    if (!result.success) {
      return res.status(401).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
      code: 'LOGIN_FAILED'
    });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const result = await AuthService.refreshToken(refreshToken);
    
    if (!result.success) {
      return res.status(401).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Token refresh failed',
      code: 'REFRESH_FAILED'
    });
  }
});

app.get('/api/auth/profile', AuthMiddleware.authenticateToken, async (req, res) => {
  try {
    const result = await AuthService.getUserProfile(req.user.id);
    res.json(result);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get profile',
      code: 'PROFILE_FAILED'
    });
  }
});

app.put('/api/auth/profile', AuthMiddleware.authenticateToken, async (req, res) => {
  try {
    const result = await AuthService.updateProfile(req.user.id, req.body);
    res.json(result);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
      code: 'UPDATE_FAILED'
    });
  }
});

app.post('/api/auth/change-password', AuthMiddleware.authenticateToken, async (req, res) => {
  try {
    const result = await AuthService.changePassword(req.user.id, req.body);
    res.json(result);
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
      code: 'CHANGE_PASSWORD_FAILED'
    });
  }
});

// Admin-only endpoints
app.post('/api/admin/create-admin', async (req, res) => {
  try {
    const result = await AuthService.createAdminUser(req.body);
    res.json(result);
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create admin user',
      code: 'CREATE_ADMIN_FAILED'
    });
  }
});

// Admin-only compilation endpoint
app.post('/api/compile', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { courseId, code, contractName } = req.body;

    if (!courseId || !code) {
      return res.status(400).json({
        success: false,
        error: 'courseId and code are required'
      });
    }

    // Use AdminCompilationManager to compile the code
    const result = await adminCompilationManager.compileCode(courseId, code, contractName);

    // Always return the full result, whether successful or not
    res.json({
      success: result.success,
      result: result.result,
      courseId: result.courseId,
      contractName: result.contractName,
      timestamp: result.timestamp
    });

  } catch (error) {
    console.error('Admin compilation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to compile code'
    });
  }
});

// Admin-only testing endpoint
app.post('/api/test', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { courseId, code, testCode, contractName, lessonId } = req.body;

    if (!courseId || !testCode) {
      return res.status(400).json({
        success: false,
        error: 'courseId and testCode are required'
      });
    }

    // If lessonId is provided, use solution code from DB instead of code from request
    let codeToTest = code;
    if (lessonId) {
      try {
        const lesson = await prismaQuery(() => prisma.lesson.findUnique({
          where: { id: lessonId },
          select: { solutionCode: true, title: true }
        }));
        
        if (lesson && lesson.solutionCode) {
          codeToTest = lesson.solutionCode;
          console.log(`[ADMIN TEST] Using solution code from DB for lesson: ${lesson.title} (${lessonId})`);
        } else {
          console.warn(`[ADMIN TEST] No solution code found for lesson ${lessonId}, using provided code`);
          if (!code) {
            return res.status(400).json({
              success: false,
              error: `No solution code found for lesson ${lessonId}, and no code provided in request`
            });
          }
        }
      } catch (error) {
        console.error(`[ADMIN TEST] Error fetching solution code: ${error.message}`);
        // Fall back to provided code
      }
    }

    if (!codeToTest) {
      return res.status(400).json({
        success: false,
        error: 'code is required (or provide lessonId with solution code in DB)'
      });
    }

    // Use AdminTestManager to test the code
    const result = await adminTestManager.testCode(courseId, codeToTest, testCode, contractName);

    // Handle test compilation failure separately
    if (result.code === 'TEST_COMPILATION_FAILED') {
      return res.status(200).json({
        success: false,
        code: result.code,
        error: result.error,
        message: result.message,
        errors: result.errors,
        result: result.result,
        courseId: result.courseId,
        contractName: result.contractName,
        testFileName: result.testFileName,
        timestamp: result.timestamp,
        usedSolutionCode: !!lessonId
      });
    }

    // Always return the full result, whether successful or not
    res.json({
      success: result.success,
      result: result.result,
      courseId: result.courseId,
      contractName: result.contractName,
      testFileName: result.testFileName,
      timestamp: result.timestamp,
      usedSolutionCode: !!lessonId
    });

  } catch (error) {
    console.error('Admin test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to run tests'
    });
  }
});

// Course management endpoints
app.post('/api/courses', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
  try {
    const { courseId, title, language, goals, level, access, thumbnail, foundryConfig, dependencies, templates, creatorId } = req.body;
    
    // Use a default creator ID if not provided (for now)
    const defaultCreatorId = creatorId || 'admin-user-id';
    
    // Create course in database
    const result = await courseService.createCourse({
      courseId,
      title,
      language,
      goals: Array.isArray(goals) ? goals.join(', ') : goals,
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
      await fs.mkdir(coursePath, { recursive: true });
      
      // Initialize git repository first (required for forge init)
      const gitInitResult = await new Promise((resolve, reject) => {
        const git = spawn('git', ['init'], {
          cwd: coursePath,
          stdio: 'pipe'
        });
        
        let stdout = '';
        let stderr = '';
        
        git.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        git.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        git.on('close', (code) => {
          resolve({ code, stdout, stderr });
        });
        
        git.on('error', (error) => {
          console.error(`🔧 Git error: ${error.message}`);
          reject(error);
        });
      });

      // Initialize Foundry project
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
      
      // Always install default libraries (forge-std and openzeppelin-contracts)
      // These are essential for Solidity development and testing
      const defaultDependencies = [
        { name: 'forge-std', url: 'https://github.com/foundry-rs/forge-std' },
        { name: 'openzeppelin-contracts', url: 'https://github.com/OpenZeppelin/openzeppelin-contracts' }
      ];
      
      // Merge default dependencies with provided dependencies
      const allDependencies = [...defaultDependencies];
      if (dependencies && dependencies.length > 0) {
        // Add provided dependencies, avoiding duplicates
        for (const dep of dependencies) {
          const isDuplicate = allDependencies.some(d => 
            d.name === dep.name || 
            (dep.name === 'forge-std' || dep.name === 'openzeppelin-contracts')
          );
          if (!isDuplicate) {
            allDependencies.push(dep);
          }
        }
      }
      
      // Install all dependencies
      if (allDependencies.length > 0) {
        // Map common dependency names to their GitHub URLs (fallback for old format)
        const dependencyUrls = {
          'openzeppelin-contracts': 'https://github.com/OpenZeppelin/openzeppelin-contracts',
          'forge-std': 'https://github.com/foundry-rs/forge-std',
          'ds-test': 'https://github.com/dapphub/ds-test',
          'solmate': 'https://github.com/transmissions11/solmate',
          'prb-math': 'https://github.com/PaulRBerg/prb-math'
        };
        
        for (const dependency of allDependencies) {
          try {
            const dependencyUrl = dependency.url || dependencyUrls[dependency.name];
            if (!dependencyUrl) {
              console.warn(`⚠️ No URL found for dependency: ${dependency.name}`);
              continue;
            }
            
            const installResult = await new Promise((resolve, reject) => {
              const args = ['install', dependencyUrl];
              if (dependency.version && dependency.version !== 'latest') {
                args.push('--tag', dependency.version);
              }
              
              const forge = spawn('forge', args, {
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
                resolve({ code, stdout, stderr });
              });
              
              forge.on('error', (error) => {
                reject(error);
              });
            });
            
            if (installResult.code !== 0) {
              console.warn(`⚠️ Failed to install ${dependency.name}: ${installResult.stderr}`);
            }
          } catch (depError) {
            console.warn(`⚠️ Error installing ${dependency.name}:`, depError.message);
          }
        }
      }
      
      // Create course workspace structure under COURSE_WORKSPACE_DIR
      try {
        const courseRoot = process.env.COURSE_WORKSPACE_DIR || path.join(__dirname, 'courses');
        const courseBase = path.join(courseRoot, `${courseId}`);
        await fs.mkdir(courseBase, { recursive: true });
        await fs.mkdir(path.join(courseBase, 'students'), { recursive: true });
        await fs.mkdir(path.join(courseBase, 'templates'), { recursive: true });
        await fs.mkdir(path.join(courseBase, 'tests'), { recursive: true });
        const libDir = path.join(courseBase, 'lib');
        try {
          await fs.access(libDir);
        } catch {
          await fs.mkdir(libDir, { recursive: true });
          // Prefer copying from the Foundry project we just created for this course
          const foundrySource = path.join(basePath, `course-${courseId}`, 'lib');
          const libSource = (await fs.stat(foundrySource).then(() => foundrySource).catch(() => process.env.COURSE_LIB_SOURCE_DIR)) || null;
          if (libSource) {
            // best-effort copy common libraries
            const copyLibrary = async (name) => {
              const src = path.join(libSource, name);
              const dest = path.join(libDir, name);
              try {
                await fs.access(src);
                // Node 18+ fs.cp exists; fallback otherwise
                if (fs.cp) {
                  await fs.cp(src, dest, { recursive: true });
                } else {
                  await fs.mkdir(dest, { recursive: true });
                }
              } catch {}
            };
            await copyLibrary('forge-std');
            await copyLibrary('openzeppelin-contracts');
          }
        }
      } catch (wsErr) {
        console.warn('⚠️ Could not initialize course workspace structure:', wsErr.message);
      }

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
app.put('/api/courses/:courseId', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
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
app.delete('/api/courses/:courseId', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
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


// Image upload endpoints
app.post('/api/upload/course-thumbnail', uploadSingleImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
    }

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
app.post('/api/courses/:courseId/modules', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
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

app.put('/api/modules/:moduleId', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
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

app.delete('/api/modules/:moduleId', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
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
app.post('/api/modules/:moduleId/lessons', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
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

app.put('/api/lessons/:lessonId', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
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

app.delete('/api/lessons/:lessonId', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
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
app.post('/api/lessons/:lessonId/challenge-tests', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
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
app.post('/api/lessons/:lessonId/quiz-questions', AuthMiddleware.authenticateToken, AuthMiddleware.requireAdmin, async (req, res) => {
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

// Serve uploaded images from foundry-projects volume (persistent storage)
// Fly.io only supports 1 volume per machine, so uploads are stored in foundry-projects
app.use('/uploads', express.static(path.join(__dirname, 'foundry-projects', 'uploads')));
// Alias for images to allow frontend to reference a consistent path
app.use('/api/images', express.static(path.join(__dirname, 'foundry-projects', 'uploads')));

// ========== AI Chat Endpoints ==========
app.post('/api/ai/chat', AuthMiddleware.authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { messages, model, metadata } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages required', code: 'MISSING_MESSAGES' });
    }
    const result = await AIService.chat({ messages, model, metadata });
    const status = result.success ? 200 : 400;
    res.status(status).json(result);
  } catch (error) {
    console.error('AI chat endpoint error:', error);
    res.status(500).json({ success: false, error: 'AI chat failed', code: 'AI_FAILED' });
  }
});

// ========== Student Workspace Endpoints (separate from admin) ==========
app.post('/api/student/workspace/init', AuthMiddleware.authenticateToken, studentLimiter, async (req, res) => {
  try {
    const { courseId, exerciseId, mode, useTemplate } = req.body || {};
    const result = await StudentWorkspaceService.initWorkspace(req.user.id, { courseId, exerciseId, mode, useTemplate });
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Student workspace init error:', error);
    res.status(500).json({ success: false, error: 'Init failed' });
  }
});

// Save code only
app.put('/api/student/code', AuthMiddleware.authenticateToken, studentLimiter, async (req, res) => {
  try {
    const { courseId, lessonId, files } = req.body || {};
    const result = await StudentWorkspaceService.saveCode(req.user.id, { courseId, lessonId, files });
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Student save code error:', error);
    res.status(500).json({ success: false, error: 'Save failed' });
  }
});

// Compile a specific file
app.post('/api/student/compile', AuthMiddleware.authenticateToken, studentLimiter, async (req, res) => {
  try {
    const { courseId, lessonId, filePath, solc } = req.body || {};
    if (!courseId || !lessonId) {
      return res.status(400).json({ success: false, error: 'courseId and lessonId are required' });
    }
    // Note: files are NOT accepted here - they must be saved first via PUT /api/student/code
    // This ensures DB is always the source of truth
    const result = await StudentWorkspaceService.compileFile(req.user.id, { courseId, lessonId, filePath, solc });
    res.status(result.success ? 200 : 200).json(result);
  } catch (error) {
    if (String(error.message).includes('TIMEOUT')) {
      return res.status(408).json({ success: false, error: 'Compilation timed out' });
    }
    console.error('Student compile error:', error);
    res.status(500).json({ success: false, error: 'Compilation failed' });
  }
});

// Test using evaluator file from DB
// Note: Code must be saved first via PUT /api/student/code
// This endpoint will:
// 1. Save code to DB (if files provided)
// 2. Compile code first
// 3. If compilation fails, return compilation errors/warnings (no tests run)
// 4. If compilation succeeds (or has warnings), run tests
// 5. Test file is named based on contract name: {ContractName}Test.t.sol
app.post('/api/student/test', AuthMiddleware.authenticateToken, studentLimiter, async (req, res) => {
  try {
    const { courseId, lessonId, files, filePath, solc } = req.body || {};
    
    if (!courseId || !lessonId) {
      return res.status(400).json({ success: false, error: 'courseId and lessonId are required' });
    }

    // testFile will handle:
    // - Saving code to DB if files provided (DB is source of truth)
    // - Compiling code first
    // - Returning compilation errors if compilation fails
    // - Running tests only if compilation succeeds
    // - Generating test filename from contract name: {ContractName}Test.t.sol
    // - Retrieving evaluator test from ChallengeTest table for this lesson
    // - Running ONLY the specific test file (using --match-path)
    const result = await StudentWorkspaceService.testFile(req.user.id, { 
      courseId, 
      lessonId, 
      files, 
      filePath,
      solc 
    });

    // Handle different result scenarios
    if (result.code === 'NO_CODE_FOUND') {
      return res.status(400).json(result);
    }
    if (result.code === 'NO_CONTRACT_NAME') {
      return res.status(400).json(result);
    }
    if (result.code === 'COMPILATION_FAILED') {
      // Return compilation errors without running tests
      return res.status(200).json(result);
    }
    if (result.code === 'TEST_NOT_FOUND') {
      return res.status(404).json(result);
    }

    // Test executed successfully (may have passed or failed)
    res.status(200).json(result);
  } catch (error) {
    if (String(error.message).includes('TIMEOUT')) {
      return res.status(408).json({ success: false, error: 'Test timed out' });
    }
    console.error('Student test error:', error);
    res.status(500).json({ success: false, error: 'Test failed' });
  }
});

// Get courses that a user has started
app.get('/api/student/courses', AuthMiddleware.authenticateToken, studentLimiter, async (req, res) => {
  try {
    const result = await courseService.getUserStartedCourses(req.user.id);
    
    if (!result.success) {
      return res.status(500).json(result);
    }
    
    res.status(200).json(result);
  } catch (error) {
    console.error('Get user started courses error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve user courses'
    });
  }
});

// Progress
app.get('/api/student/progress', AuthMiddleware.authenticateToken, studentLimiter, async (req, res) => {
  try {
    const { courseId, lessonId } = req.query;
    const result = await StudentWorkspaceService.getProgress(req.user.id, { courseId, lessonId });
    res.status(200).json(result);
  } catch (error) {
    console.error('Student progress error:', error);
    res.status(500).json({ success: false, error: 'Progress retrieval failed' });
  }
});

// Reset student code to initial lesson code
app.post('/api/student/reset', AuthMiddleware.authenticateToken, studentLimiter, async (req, res) => {
  try {
    const { courseId, lessonId, exerciseId } = req.body || {};
    if (!courseId || !lessonId) {
      return res.status(400).json({ success: false, error: 'courseId and lessonId are required' });
    }
    const result = await StudentWorkspaceService.resetToInitialCode(req.user.id, { courseId, lessonId, exerciseId });
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('Student reset error:', error);
    res.status(500).json({ success: false, error: 'Reset failed' });
  }
});

app.post('/api/ai/chat/stream', AuthMiddleware.authenticateToken, aiLimiter, async (req, res) => {
  try {
    const { messages, model } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages required', code: 'MISSING_MESSAGES' });
    }
    await AIService.stream(req, res, { messages, model });
  } catch (error) {
    console.error('AI chat stream endpoint error:', error);
    res.status(500).json({ success: false, error: 'AI stream failed', code: 'AI_FAILED' });
  }
});

// Error handlers for unhandled rejections and exceptions
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit in production, but log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Exit gracefully
  process.exit(1);
});

// Start the server
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`Health check available at http://${HOST}:${PORT}/health`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }
  
  const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;
  
  switch (error.code) {
    case 'EACCES':
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
});