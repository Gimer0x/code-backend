import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CompilationManager {
  constructor() {
    // Use local paths for development, Docker paths for production
    this.basePath = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, './foundry-projects');
    this.studentSessionsPath = process.env.STUDENT_SESSIONS_DIR || path.join(__dirname, '../student-sessions');
  }

  /**
   * Compile student code for a specific course and lesson
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {string} lessonId - Lesson ID
   * @param {string} code - Solidity code to compile
   * @param {Object} options - Compilation options
   * @returns {Promise<Object>} Compilation result
   */
  async compileStudentCode(userId, courseId, lessonId, code, options = {}) {
    try {
      const sessionId = `${userId}-${courseId}-${lessonId}`;
      const sessionPath = path.join(this.studentSessionsPath, sessionId);
      
      // Create session directory
      await this.createSessionDirectory(sessionPath);
      
      // Write student code to file
      const contractName = options.contractName || 'StudentContract';
      const contractFile = path.join(sessionPath, 'src', `${contractName}.sol`);
      await fs.writeFile(contractFile, code, 'utf8');
      
      // Copy course project files to session
      await this.copyCourseProjectToSession(courseId, sessionPath);
      
      // Compile the code
      const compilationResult = await this.runCompilation(sessionPath, options);
      
      // Parse compilation results
      const parsedResult = this.parseCompilationResult(compilationResult);
      
      // Store compilation result
      await this.storeCompilationResult(userId, courseId, lessonId, parsedResult);
      
      // Clean up session directory
      await this.cleanupSession(sessionPath);
      
      return {
        success: parsedResult.success,
        result: parsedResult,
        sessionId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error compiling student code:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Create session directory structure
   * @param {string} sessionPath - Session directory path
   */
  async createSessionDirectory(sessionPath) {
    const directories = [
      sessionPath,
      path.join(sessionPath, 'src'),
      path.join(sessionPath, 'test'),
      path.join(sessionPath, 'script'),
      path.join(sessionPath, 'lib')
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Copy course project files to session
   * @param {string} courseId - Course ID
   * @param {string} sessionPath - Session directory path
   */
  async copyCourseProjectToSession(courseId, sessionPath) {
    const courseProjectPath = path.join(this.basePath, `course-${courseId}`);
    
    try {
      // Copy foundry.toml
      const foundryToml = path.join(courseProjectPath, 'foundry.toml');
      const sessionFoundryToml = path.join(sessionPath, 'foundry.toml');
      await fs.copyFile(foundryToml, sessionFoundryToml);
      
      // Copy remappings.txt
      const remappings = path.join(courseProjectPath, 'remappings.txt');
      const sessionRemappings = path.join(sessionPath, 'remappings.txt');
      await fs.copyFile(remappings, sessionRemappings);
      
      // Copy lib directory
      const libSource = path.join(courseProjectPath, 'lib');
      const libDest = path.join(sessionPath, 'lib');
      await this.copyDirectory(libSource, libDest);
    } catch (error) {
      console.error('Error copying course project to session:', error);
      // Continue with compilation even if copying fails
    }
  }

  /**
   * Run Foundry compilation
   * @param {string} sessionPath - Session directory path
   * @param {Object} options - Compilation options
   * @returns {Promise<Object>} Compilation result
   */
  async runCompilation(sessionPath, options = {}) {
    return new Promise((resolve, reject) => {
      const args = ['build'];
      if (options.verbose) {
        args.push('--verbose');
      }
      if (options.extraOutput) {
        args.push('--extra-output', options.extraOutput);
      }

      const process = spawn('forge', args, {
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
          stderr,
          timestamp: new Date().toISOString()
        });
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse compilation result
   * @param {Object} result - Raw compilation result
   * @returns {Object} Parsed compilation result
   */
  parseCompilationResult(result) {
    const { success, stdout, stderr } = result;
    
    if (success) {
      return {
        success: true,
        output: this.parseSuccessfulOutput(stdout),
        warnings: this.parseWarnings(stderr),
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        errors: this.parseErrors(stderr),
        warnings: this.parseWarnings(stderr),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Parse successful compilation output
   * @param {string} stdout - Standard output
   * @returns {Object} Parsed output
   */
  parseSuccessfulOutput(stdout) {
    // Extract compilation artifacts
    const artifacts = this.extractArtifacts(stdout);
    
    return {
      artifacts,
      compilationTime: this.extractCompilationTime(stdout),
      contracts: this.extractContractInfo(stdout)
    };
  }

  /**
   * Extract compilation artifacts
   * @param {string} output - Compilation output
   * @returns {Array} List of artifacts
   */
  extractArtifacts(output) {
    const artifacts = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('Compiling') && line.includes('.sol')) {
        const match = line.match(/Compiling (.+\.sol)/);
        if (match) {
          artifacts.push({
            file: match[1],
            status: 'compiled'
          });
        }
      }
    }
    
    return artifacts;
  }

  /**
   * Extract compilation time
   * @param {string} output - Compilation output
   * @returns {number} Compilation time in milliseconds
   */
  extractCompilationTime(output) {
    const timeMatch = output.match(/Finished in (\d+\.?\d*)ms/);
    return timeMatch ? parseFloat(timeMatch[1]) : null;
  }

  /**
   * Extract contract information
   * @param {string} output - Compilation output
   * @returns {Array} List of contracts
   */
  extractContractInfo(output) {
    const contracts = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      if (line.includes('Successfully compiled')) {
        const match = line.match(/Successfully compiled (\d+) contracts/);
        if (match) {
          contracts.push({
            count: parseInt(match[1]),
            status: 'success'
          });
        }
      }
    }
    
    return contracts;
  }

  /**
   * Parse compilation errors
   * @param {string} stderr - Standard error output
   * @returns {Array} List of errors
   */
  parseErrors(stderr) {
    const errors = [];
    const lines = stderr.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('Error:')) {
        const error = {
          type: 'compilation_error',
          message: line.replace('Error:', '').trim(),
          line: i + 1
        };
        
        // Try to extract more details from next lines
        if (i + 1 < lines.length && lines[i + 1].includes('-->')) {
          error.location = lines[i + 1].trim();
        }
        
        errors.push(error);
      }
    }
    
    return errors;
  }

  /**
   * Parse compilation warnings
   * @param {string} stderr - Standard error output
   * @returns {Array} List of warnings
   */
  parseWarnings(stderr) {
    const warnings = [];
    const lines = stderr.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('Warning:')) {
        const warning = {
          type: 'compilation_warning',
          message: line.replace('Warning:', '').trim(),
          line: i + 1
        };
        
        warnings.push(warning);
      }
    }
    
    return warnings;
  }

  /**
   * Store compilation result in database
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {string} lessonId - Lesson ID
   * @param {Object} result - Compilation result
   */
  async storeCompilationResult(userId, courseId, lessonId, result) {
    // This would typically store in a database
    // For now, we'll just log the result
    console.log('Storing compilation result:', {
      userId,
      courseId,
      lessonId,
      result
    });
    
    // In a real implementation, this would:
    // 1. Connect to the database
    // 2. Store the compilation result
    // 3. Update student progress
    // 4. Return the stored result ID
  }

  /**
   * Clean up session directory
   * @param {string} sessionPath - Session directory path
   */
  async cleanupSession(sessionPath) {
    try {
      await fs.rm(sessionPath, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up session:', error);
    }
  }

  /**
   * Copy directory recursively
   * @param {string} src - Source directory
   * @param {string} dest - Destination directory
   */
  async copyDirectory(src, dest) {
    try {
      const entries = await fs.readdir(src, { withFileTypes: true });
      
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
          await fs.mkdir(destPath, { recursive: true });
          await this.copyDirectory(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    } catch (error) {
      console.error(`Failed to copy directory ${src} to ${dest}:`, error);
    }
  }

  /**
   * Get compilation history for a student
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {string} lessonId - Lesson ID
   * @returns {Promise<Array>} Compilation history
   */
  async getCompilationHistory(userId, courseId, lessonId) {
    // This would typically query the database
    // For now, return empty array
    return [];
  }

  /**
   * Get latest compilation result for a student
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {string} lessonId - Lesson ID
   * @returns {Promise<Object|null>} Latest compilation result
   */
  async getLatestCompilationResult(userId, courseId, lessonId) {
    // This would typically query the database
    // For now, return null
    return null;
  }
}
