import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TestManager {
  constructor() {
    // Use local paths for development, Docker paths for production
    this.basePath = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, './foundry-projects');
    this.studentSessionsPath = process.env.STUDENT_SESSIONS_DIR || path.join(__dirname, '../../student-sessions');
  }

  /**
   * Run tests for student code
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {string} lessonId - Lesson ID
   * @param {string} code - Solidity code to test
   * @param {string} testCode - Test code
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test result
   */
  async runStudentTests(userId, courseId, lessonId, code, testCode, options = {}) {
    try {
      const sessionId = `${userId}-${courseId}-${lessonId}`;
      const sessionPath = path.join(this.studentSessionsPath, sessionId);
      
      console.log('Starting test run for session:', sessionId);
      console.log('Session path:', sessionPath);
      console.log('Student sessions path:', this.studentSessionsPath);
      
      // Create session directory
      await this.createSessionDirectory(sessionPath);
      
      // Write student code to file
      const contractName = options.contractName || 'StudentContract';
      const contractFile = path.join(sessionPath, 'src', `${contractName}.sol`);
      await fs.writeFile(contractFile, code, 'utf8');
      
      // Write test code to file
      const testName = options.testName || 'StudentContractTest';
      const testFile = path.join(sessionPath, 'test', `${testName}.t.sol`);
      await fs.writeFile(testFile, testCode, 'utf8');
      
      // Copy course project files to session
      await this.copyCourseProjectToSession(courseId, sessionPath);
      
      // Run tests
      const testResult = await this.runTests(sessionPath, options);
      
      // Parse test results
      const parsedResult = this.parseTestResult(testResult);
      
      // Store test result
      await this.storeTestResult(userId, courseId, lessonId, parsedResult);
      
      // Clean up session directory (disabled for debugging)
      // await this.cleanupSession(sessionPath);
      
      return {
        success: parsedResult.success,
        result: parsedResult,
        sessionId,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error running student tests:', error);
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
    console.log('Creating session directory:', sessionPath);
    const directories = [
      sessionPath,
      path.join(sessionPath, 'src'),
      path.join(sessionPath, 'test'),
      path.join(sessionPath, 'script'),
      path.join(sessionPath, 'lib')
    ];

    for (const dir of directories) {
      console.log('Creating directory:', dir);
      await fs.mkdir(dir, { recursive: true });
    }
    console.log('Session directory created successfully');
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
      // Continue with testing even if copying fails
    }
  }

  /**
   * Run Foundry tests
   * @param {string} sessionPath - Session directory path
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test result
   */
  async runTests(sessionPath, options = {}) {
    return new Promise((resolve, reject) => {
      const args = ['test'];
      
      if (options.verbose) {
        args.push('--verbose');
      }
      
      if (options.matchPath) {
        args.push('--match-path', options.matchPath);
      }
      
      if (options.matchTest) {
        args.push('--match-test', options.matchTest);
      }
      
      if (options.gasReport) {
        args.push('--gas-report');
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
   * Parse test result
   * @param {Object} result - Raw test result
   * @returns {Object} Parsed test result
   */
  parseTestResult(result) {
    const { success, stdout, stderr } = result;
    
    if (success) {
      return {
        success: true,
        tests: this.parseSuccessfulTests(stdout),
        gasReport: this.parseGasReport(stdout),
        warnings: this.parseWarnings(stderr),
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        errors: this.parseTestErrors(stderr),
        warnings: this.parseWarnings(stderr),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Parse successful test results
   * @param {string} stdout - Standard output
   * @returns {Object} Parsed test results
   */
  parseSuccessfulTests(stdout) {
    const tests = [];
    const lines = stdout.split('\n');
    
    let currentTest = null;
    let testCount = 0;
    let passedCount = 0;
    let failedCount = 0;
    
    for (const line of lines) {
      // Test start
      if (line.includes('Running') && line.includes('test')) {
        const match = line.match(/Running (\d+) test/);
        if (match) {
          testCount = parseInt(match[1]);
        }
      }
      
      // Individual test result
      if (line.includes('PASS') || line.includes('FAIL')) {
        const isPass = line.includes('PASS');
        const testName = this.extractTestName(line);
        
        if (testName) {
          tests.push({
            name: testName,
            status: isPass ? 'pass' : 'fail',
            message: line.trim()
          });
          
          if (isPass) {
            passedCount++;
          } else {
            failedCount++;
          }
        }
      }
      
      // Gas usage
      if (line.includes('gas:')) {
        const gasMatch = line.match(/gas: (\d+)/);
        if (gasMatch && currentTest) {
          currentTest.gasUsed = parseInt(gasMatch[1]);
        }
      }
    }
    
    return {
      total: testCount,
      passed: passedCount,
      failed: failedCount,
      tests,
      success: failedCount === 0
    };
  }

  /**
   * Extract test name from line
   * @param {string} line - Test line
   * @returns {string|null} Test name
   */
  extractTestName(line) {
    const match = line.match(/test\w+\(\)/);
    return match ? match[0] : null;
  }

  /**
   * Parse gas report
   * @param {string} stdout - Standard output
   * @returns {Object} Gas report
   */
  parseGasReport(stdout) {
    const gasReport = {
      total: 0,
      average: 0,
      tests: []
    };
    
    const lines = stdout.split('\n');
    let totalGas = 0;
    let testCount = 0;
    
    for (const line of lines) {
      if (line.includes('gas:')) {
        const gasMatch = line.match(/gas: (\d+)/);
        if (gasMatch) {
          const gas = parseInt(gasMatch[1]);
          totalGas += gas;
          testCount++;
          
          gasReport.tests.push({
            gas: gas,
            line: line.trim()
          });
        }
      }
    }
    
    if (testCount > 0) {
      gasReport.total = totalGas;
      gasReport.average = totalGas / testCount;
    }
    
    return gasReport;
  }

  /**
   * Parse test errors
   * @param {string} stderr - Standard error output
   * @returns {Array} List of errors
   */
  parseTestErrors(stderr) {
    const errors = [];
    const lines = stderr.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('Error:') || line.includes('FAIL')) {
        const error = {
          type: 'test_error',
          message: line.trim(),
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
   * Parse warnings
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
          type: 'test_warning',
          message: line.replace('Warning:', '').trim(),
          line: i + 1
        };
        
        warnings.push(warning);
      }
    }
    
    return warnings;
  }

  /**
   * Store test result in database
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {string} lessonId - Lesson ID
   * @param {Object} result - Test result
   */
  async storeTestResult(userId, courseId, lessonId, result) {
    // This would typically store in a database
    // For now, we'll just log the result
    console.log('Storing test result:', {
      userId,
      courseId,
      lessonId,
      result
    });
    
    // In a real implementation, this would:
    // 1. Connect to the database
    // 2. Store the test result
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
   * Get test history for a student
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {string} lessonId - Lesson ID
   * @returns {Promise<Array>} Test history
   */
  async getTestHistory(userId, courseId, lessonId) {
    // This would typically query the database
    // For now, return empty array
    return [];
  }

  /**
   * Get latest test result for a student
   * @param {string} userId - User ID
   * @param {string} courseId - Course ID
   * @param {string} lessonId - Lesson ID
   * @returns {Promise<Object|null>} Latest test result
   */
  async getLatestTestResult(userId, courseId, lessonId) {
    // This would typically query the database
    // For now, return null
    return null;
  }
}
