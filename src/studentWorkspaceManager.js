import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Student Workspace Manager
 * Manages course-level student workspaces instead of per-lesson sessions
 */
export class StudentWorkspaceManager {
  constructor() {
    this.basePath = process.env.FOUNDRY_PROJECTS_DIR || path.join(__dirname, './foundry-projects');
    this.studentWorkspacesPath = process.env.STUDENT_WORKSPACES_DIR || path.join(__dirname, '../student-workspaces');
  }

  /**
   * Get or create student workspace for a course
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @returns {Promise<string>} Workspace path
   */
  async getOrCreateStudentWorkspace(userId, courseId) {
    // Use ephemeral workspaces for all users since student code is stored in DB
    // This prevents accumulation of persistent folders and improves performance
    return await this.createEphemeralWorkspace(userId, courseId);
  }

  /**
   * Check if user is anonymous
   * @param {string} userId - User ID
   * @returns {boolean} True if anonymous
   */
  isAnonymousUser(userId) {
    return userId === 'anonymous' || userId.startsWith('anonymous-');
  }

  /**
   * Create ephemeral workspace for anonymous users
   * @param {string} userId - User ID (anonymous)
   * @param {string} courseId - Course ID
   * @returns {Promise<string>} Ephemeral workspace path
   */
  async createEphemeralWorkspace(userId, courseId) {
    const sessionId = `ephemeral-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workspaceId = `${userId}-${courseId}`;
    const workspacePath = path.join(this.studentWorkspacesPath, workspaceId);
    
    console.log(`🔄 Creating ephemeral workspace: ${workspaceId} (session: ${sessionId})`);
    
    // Create ephemeral workspace directory structure
    await fs.mkdir(workspacePath, { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'test'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'lib'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'script'), { recursive: true });
    
    // Copy course project files (dependencies and templates)
    await this.copyCourseProjectToWorkspace(courseId, workspacePath);
    
    // Initialize Foundry project
    await this.initializeFoundryProject(workspacePath);
    
    console.log(`✅ Ephemeral workspace created: ${workspaceId}`);
    return workspacePath;
  }

  /**
   * Create a new student workspace for a course
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @returns {Promise<string>} Workspace path
   */
  async createStudentWorkspace(userId, courseId) {
    const workspaceId = `${userId}-${courseId}`;
    const workspacePath = path.join(this.studentWorkspacesPath, workspaceId);
    
    console.log(`🏗️ Creating student workspace: ${workspaceId}`);
    
    // Create workspace directory structure
    await fs.mkdir(workspacePath, { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'test'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'lib'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, 'script'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, '.history'), { recursive: true });
    await fs.mkdir(path.join(workspacePath, '.sessions'), { recursive: true });
    
    // Copy course project files
    await this.copyCourseProjectToWorkspace(courseId, workspacePath);
    
    // Initialize Foundry project
    await this.initializeFoundryProject(workspacePath);
    
    console.log(`✅ Student workspace created: ${workspaceId}`);
    return workspacePath;
  }

  /**
   * Copy course project files to student workspace
   * @param {string} courseId - Course ID
   * @param {string} workspacePath - Student workspace path
   */
  async copyCourseProjectToWorkspace(courseId, workspacePath) {
    const courseProjectPath = path.join(this.basePath, `course-${courseId}`);
    
    try {
      // Copy foundry.toml
      const foundryToml = path.join(courseProjectPath, 'foundry.toml');
      const workspaceFoundryToml = path.join(workspacePath, 'foundry.toml');
      await fs.copyFile(foundryToml, workspaceFoundryToml);
      
      // Copy lib directory
      const libSource = path.join(courseProjectPath, 'lib');
      const libDest = path.join(workspacePath, 'lib');
      try {
        await fs.access(libSource);
        await fs.cp(libSource, libDest, { recursive: true });
        console.log(`📚 Copied dependencies from course project`);
      } catch (error) {
        console.log(`⚠️ No lib directory found in course project`);
      }
      
      // Copy any existing src files (templates, examples)
      const srcSource = path.join(courseProjectPath, 'src');
      const srcDest = path.join(workspacePath, 'src');
      try {
        await fs.access(srcSource);
        const srcFiles = await fs.readdir(srcSource);
        for (const file of srcFiles) {
          if (file.endsWith('.sol')) {
            const sourceFile = path.join(srcSource, file);
            const destFile = path.join(srcDest, file);
            await fs.copyFile(sourceFile, destFile);
          }
        }
        console.log(`📄 Copied source templates from course project`);
      } catch (error) {
        console.log(`⚠️ No src directory found in course project`);
      }
      
    } catch (error) {
      console.log(`⚠️ Course project not found, using default configuration`);
      await this.createDefaultFoundryConfig(workspacePath);
    }
  }

  /**
   * Initialize Foundry project in workspace
   * @param {string} workspacePath - Workspace path
   */
        async initializeFoundryProject(workspacePath) {
          return new Promise((resolve, reject) => {
            console.log(`🔧 Initializing Foundry project in workspace`);
            
            // Clean up any existing lib directory to avoid conflicts
            const libPath = path.join(workspacePath, 'lib');
            try {
              if (fsSync.existsSync(libPath)) {
                fsSync.rmSync(libPath, { recursive: true, force: true });
                console.log(`🧹 Cleaned up existing lib directory`);
              }
            } catch (error) {
              console.log(`⚠️ Could not clean lib directory: ${error.message}`);
            }
            
            const forge = spawn('forge', ['init', '--force', '.'], {
              cwd: workspacePath,
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
        if (code === 0) {
          console.log(`✅ Foundry project initialized successfully`);
          resolve({ success: true, stdout, stderr });
        } else {
          console.log(`⚠️ Foundry init completed with warnings: ${stderr}`);
          // Even if forge init fails, try to install dependencies manually
          this.installFoundryDependencies(workspacePath)
            .then(() => resolve({ success: true, stdout, stderr }))
            .catch(() => resolve({ success: true, stdout, stderr })); // Still consider it successful
        }
      });
      
      forge.on('error', (error) => {
        console.error(`❌ Error initializing Foundry project:`, error);
        // Try to install dependencies manually even if forge init fails
        this.installFoundryDependencies(workspacePath)
          .then(() => resolve({ success: true, stdout: '', stderr: error.message }))
          .catch(() => resolve({ success: true, stdout: '', stderr: error.message }));
      });
    });
  }

  /**
   * Install Foundry dependencies manually
   * @param {string} workspacePath - Workspace path
   */
        async installFoundryDependencies(workspacePath) {
          return new Promise((resolve, reject) => {
            console.log(`📦 Installing Foundry dependencies manually`);
            
            const forge = spawn('forge', ['install', 'foundry-rs/forge-std'], {
              cwd: workspacePath,
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
        if (code === 0) {
          console.log(`✅ Foundry dependencies installed successfully`);
          resolve({ success: true, stdout, stderr });
        } else {
          console.log(`⚠️ Foundry dependency installation completed with warnings: ${stderr}`);
          resolve({ success: true, stdout, stderr }); // Still consider it successful
        }
      });
      
      forge.on('error', (error) => {
        console.error(`❌ Error installing Foundry dependencies:`, error);
        reject(error);
      });
    });
  }

  /**
   * Create default Foundry configuration
   * @param {string} workspacePath - Workspace path
   */
  async createDefaultFoundryConfig(workspacePath) {
    const defaultFoundryToml = `[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.30"
optimizer = true
optimizer_runs = 200
extra_output = ["storageLayout", "metadata"]
extra_output_files = ["metadata"]
solc_args = "--warn-unused-return --warn-unused-param"
remappings = [
    "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
    "forge-std/=lib/forge-std/src/"
]`;
    
    const foundryTomlPath = path.join(workspacePath, 'foundry.toml');
    await fs.writeFile(foundryTomlPath, defaultFoundryToml, 'utf8');
    console.log(`📝 Created default foundry.toml`);
  }

  /**
   * Save lesson code to workspace
   * @param {string} workspacePath - Workspace path
   * @param {string} lessonId - Lesson ID
   * @param {string} code - Student code
   * @param {string} fileName - File name (default: main.sol)
   */
  async saveLessonCode(workspacePath, lessonId, code, fileName = 'main.sol') {
    // Ensure fileName has .sol extension
    if (!fileName.endsWith('.sol')) {
      fileName = `${fileName}.sol`;
    }
    
    // Save current lesson code to main workspace
    const currentCodePath = path.join(workspacePath, 'src', fileName);
    await fs.writeFile(currentCodePath, code, 'utf8');
    
    // Save to lesson history
    const historyPath = path.join(workspacePath, '.history', `lesson-${lessonId}`);
    await fs.mkdir(historyPath, { recursive: true });
    const historyCodePath = path.join(historyPath, fileName);
    await fs.writeFile(historyCodePath, code, 'utf8');
    
    console.log(`💾 Saved lesson code for lesson ${lessonId}`);
  }

  /**
   * Load lesson code from workspace
   * @param {string} workspacePath - Workspace path
   * @param {string} lessonId - Lesson ID
   * @param {string} fileName - File name (default: main.sol)
   * @returns {Promise<string>} Lesson code
   */
  async loadLessonCode(workspacePath, lessonId, fileName = 'main.sol') {
    try {
      // Try to load from lesson history first
      const historyDir = path.join(workspacePath, '.history', `lesson-${lessonId}`);
      
      // List files in the history directory to find the actual file
      const historyFiles = await fs.readdir(historyDir);
      const codeFile = historyFiles.find(file => file.endsWith('.sol') || !file.includes('.'));
      
      if (codeFile) {
        const historyPath = path.join(historyDir, codeFile);
        const historyCode = await fs.readFile(historyPath, 'utf8');
        console.log(`📖 Loaded lesson code from history for lesson ${lessonId}`);
        return historyCode;
      }
      
      throw new Error('No code file found in history');
    } catch (error) {
      // Fallback to current workspace code
      try {
        const currentCodePath = path.join(workspacePath, 'src', fileName);
        const currentCode = await fs.readFile(currentCodePath, 'utf8');
        console.log(`📖 Loaded current workspace code for lesson ${lessonId}`);
        return currentCode;
      } catch (error) {
        console.log(`⚠️ No code found for lesson ${lessonId}`);
        return '';
      }
    }
  }

  /**
   * Create temporary session for compilation/testing
   * @param {string} workspacePath - Workspace path
   * @param {string} sessionId - Session ID
   * @returns {Promise<string>} Session path
   */
  async createTempSession(workspacePath, sessionId) {
    const sessionPath = path.join(workspacePath, '.sessions', sessionId);
    await fs.mkdir(sessionPath, { recursive: true });
    
    // Copy specific directories and files to session
    const itemsToCopy = ['src', 'test', 'lib', 'script', 'foundry.toml', 'foundry.lock'];
    
    for (const item of itemsToCopy) {
      const sourcePath = path.join(workspacePath, item);
      const destPath = path.join(sessionPath, item);
      
      try {
        const stats = await fs.stat(sourcePath);
        if (stats.isDirectory()) {
          await fs.cp(sourcePath, destPath, { recursive: true });
        } else {
          await fs.copyFile(sourcePath, destPath);
        }
      } catch (error) {
        // Item doesn't exist, skip it
        console.log(`⚠️ Skipping ${item}: ${error.message}`);
      }
    }
    
    console.log(`🔄 Created temporary session: ${sessionId}`);
    return sessionPath;
  }

  /**
   * Clean up temporary session
   * @param {string} sessionPath - Session path
   */
  async cleanupTempSession(sessionPath) {
    try {
      await fs.rm(sessionPath, { recursive: true, force: true });
      console.log(`🧹 Cleaned up temporary session`);
    } catch (error) {
      console.log(`⚠️ Error cleaning up session: ${error.message}`);
    }
  }

  /**
   * Clean up ephemeral workspace for anonymous users
   * @param {string} workspacePath - Workspace path
   */
  async cleanupEphemeralWorkspace(workspacePath) {
    try {
      await fs.rm(workspacePath, { recursive: true, force: true });
      console.log(`🧹 Cleaned up ephemeral workspace`);
    } catch (error) {
      console.log(`⚠️ Error cleaning up ephemeral workspace: ${error.message}`);
    }
  }

  /**
   * Get workspace status
   * @param {string} workspacePath - Workspace path
   * @returns {Promise<Object>} Workspace status
   */
  async getWorkspaceStatus(workspacePath) {
    try {
      const stats = await fs.stat(workspacePath);
      const srcFiles = await fs.readdir(path.join(workspacePath, 'src'));
      const historyLessons = await fs.readdir(path.join(workspacePath, '.history'));
      
      return {
        exists: true,
        created: stats.birthtime,
        modified: stats.mtime,
        srcFiles: srcFiles.filter(file => file.endsWith('.sol')),
        historyLessons: historyLessons.filter(lesson => lesson.startsWith('lesson-')),
        workspacePath
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }

  /**
   * List all student workspaces
   * @returns {Promise<Array>} List of workspaces
   */
  async listStudentWorkspaces() {
    try {
      const workspaces = await fs.readdir(this.studentWorkspacesPath);
      return workspaces.filter(workspace => {
        // Filter out hidden files and directories
        return !workspace.startsWith('.') && workspace.includes('-');
      });
    } catch (error) {
      console.log(`⚠️ Error listing workspaces: ${error.message}`);
      return [];
    }
  }

  /**
   * Clean up old workspaces (optional maintenance)
   * @param {number} daysOld - Days old threshold
   */
  async cleanupOldWorkspaces(daysOld = 30) {
    const workspaces = await this.listStudentWorkspaces();
    const cutoffDate = new Date(Date.now() - (daysOld * 24 * 60 * 60 * 1000));
    
    for (const workspace of workspaces) {
      const workspacePath = path.join(this.studentWorkspacesPath, workspace);
      try {
        const stats = await fs.stat(workspacePath);
        if (stats.mtime < cutoffDate) {
          await fs.rm(workspacePath, { recursive: true, force: true });
          console.log(`🗑️ Cleaned up old workspace: ${workspace}`);
        }
      } catch (error) {
        console.log(`⚠️ Error cleaning up workspace ${workspace}: ${error.message}`);
      }
    }
  }
}
