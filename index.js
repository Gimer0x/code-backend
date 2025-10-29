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
import { uploadSingleImage, processImage } from './src/imageUpload.js';
import { CourseService } from './src/courseService.js';
import { ModuleService } from './src/moduleService.js';
import { LessonService } from './src/lessonService.js';
import { AuthService } from './src/authService.js';
import { AuthMiddleware } from './src/authMiddleware.js';
import { AdminCompilationManager } from './src/adminCompilationManager.js';
import { AdminTestManager } from './src/adminTestManager.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


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
const adminCompilationManager = new AdminCompilationManager();
const adminTestManager = new AdminTestManager();


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

// Authentication endpoints
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

    console.log(`🔧 Admin compiling code for course ${courseId}`);

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
    const { courseId, code, testCode, contractName } = req.body;

    if (!courseId || !code || !testCode) {
      return res.status(400).json({
        success: false,
        error: 'courseId, code, and testCode are required'
      });
    }

    console.log(`🧪 Admin testing code for course ${courseId}`);

    // Use AdminTestManager to test the code
    const result = await adminTestManager.testCode(courseId, code, testCode, contractName);

    // Always return the full result, whether successful or not
    res.json({
      success: result.success,
      result: result.result,
      courseId: result.courseId,
      contractName: result.contractName,
      testFileName: result.testFileName,
      timestamp: result.timestamp
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
    
    console.log(`🔧 Creating course: ${title} (${courseId})`);
    
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
      console.log(`🔧 Creating directory: ${coursePath}`);
      await fs.mkdir(coursePath, { recursive: true });
      
      // Initialize git repository first (required for forge init)
      console.log(`🔧 Initializing git repository in: ${coursePath}`);
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
          console.log(`Git init completed with code: ${code}`);
          if (stderr) console.log(`🔧 Git stderr: ${stderr}`);
          resolve({ code, stdout, stderr });
        });
        
        git.on('error', (error) => {
          console.error(`🔧 Git error: ${error.message}`);
          reject(error);
        });
      });

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
      
      // Install dependencies if provided
      if (dependencies && dependencies.length > 0) {
        console.log(`🔧 Installing dependencies: ${dependencies.map(d => d.name).join(', ')}`);
        
        // Map common dependency names to their GitHub URLs
        const dependencyUrls = {
          'openzeppelin-contracts': 'https://github.com/OpenZeppelin/openzeppelin-contracts',
          'forge-std': 'https://github.com/foundry-rs/forge-std',
          'ds-test': 'https://github.com/dapphub/ds-test',
          'solmate': 'https://github.com/transmissions11/solmate',
          'prb-math': 'https://github.com/PaulRBerg/prb-math'
        };
        
        for (const dependency of dependencies) {
          try {
            const dependencyUrl = dependencyUrls[dependency.name] || dependency.url;
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
            
            if (installResult.code === 0) {
              console.log(`✅ Installed ${dependency.name}${dependency.version ? `@${dependency.version}` : ''}`);
            } else {
              console.warn(`⚠️ Failed to install ${dependency.name}: ${installResult.stderr}`);
            }
          } catch (depError) {
            console.warn(`⚠️ Error installing ${dependency.name}:`, depError.message);
          }
        }
      }
      
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

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Start the server
app.listen(PORT, () => {
  console.log(`Foundry service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Features: Solidity compilation, Foundry testing`);
});