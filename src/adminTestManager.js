import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AdminTestManager - Handles admin-only Solidity testing
 */
export class AdminTestManager {
  constructor() {
    this.basePath = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, '../../foundry-projects');
  }

  /**
   * Test Solidity code against a course project
   * @param {string} courseId - Course ID
   * @param {string} code - Solidity code to test
   * @param {string} testCode - Test code
   * @param {string} contractName - Contract name
   * @returns {Promise<Object>} Test result
   */
  async testCode(courseId, code, testCode, contractName = 'TestContract') {
    try {
      const courseProjectPath = path.join(this.basePath, `course-${courseId}`);

      // Check if course project exists
      try {
        await fs.access(courseProjectPath);
      } catch (error) {
        throw new Error(`Course project not found: ${courseId}`);
      }

      // Create temporary testing directory
      const tempTestDir = path.join(this.basePath, '.temp-test', `course-${courseId}-${Date.now()}`);
      await fs.mkdir(tempTestDir, { recursive: true });
      
      // Copy course project files to temp directory
      await this.copyCourseProjectToTemp(courseProjectPath, tempTestDir);

      // Write the contract code
      const contractFileName = `${contractName}.sol`;
      const contractPath = path.join(tempTestDir, 'src', contractFileName);
      await fs.writeFile(contractPath, code, 'utf8');

      // Write the test code
      const testFileName = `${contractName}.t.sol`;
      const testPath = path.join(tempTestDir, 'test', testFileName);
      await fs.writeFile(testPath, testCode, 'utf8');
      
      // Clean up existing test files to avoid conflicts
      await this.cleanupExistingTests(tempTestDir, testFileName);
      
      // Run tests
      const testResult = await this.runTests(tempTestDir);
      
      // Parse test results
      const parsedResult = this.parseTestResult(testResult);
      
      // Clean up temporary directory
      await fs.rm(tempTestDir, { recursive: true, force: true });
      
      return {
        success: parsedResult.success,
        result: parsedResult,
        courseId,
        contractName: contractFileName,
        testFileName: testFileName,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('AdminTestManager error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to run tests'
      };
    }
  }

  /**
   * Copy course project to temporary directory
   * @param {string} sourcePath - Source course project path
   * @param {string} destinationPath - Destination temp path
   */
  async copyCourseProjectToTemp(sourcePath, destinationPath) {
    await fs.cp(sourcePath, destinationPath, { 
      recursive: true,
      filter: (src) => !src.includes('.temp-test') && !src.includes('.git')
    });
  }

  /**
   * Clean up existing test files to avoid conflicts
   * @param {string} tempDir - Temporary directory path
   * @param {string} excludeFile - Test file to keep
   */
  async cleanupExistingTests(tempDir, excludeFile) {
    try {
      const testDir = path.join(tempDir, 'test');
      const testFiles = await fs.readdir(testDir);
      
      for (const file of testFiles) {
        if (file.endsWith('.t.sol') && file !== excludeFile) {
          await fs.unlink(path.join(testDir, file));
        }
      }
    } catch (error) {
      // Test directory might not exist, continue
    }
  }

  /**
   * Run Foundry tests
   * @param {string} tempDir - Temporary directory path
   * @returns {Promise<Object>} Test result
   */
  async runTests(tempDir) {
    return new Promise((resolve, reject) => {
      const process = spawn('forge', ['test', '--json'], {
        cwd: tempDir,
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
   * Parse test results from forge test output
   * @param {Object} result - Raw test result
   * @returns {Object} Parsed test result
   */
  parseTestResult(result) {
    const { success, stdout, stderr } = result;
    
    // Try to parse JSON output regardless of success/failure
    // Forge test --json outputs JSON even when tests fail
    try {
      const testData = JSON.parse(stdout);
      return this.parseJsonTestResult(testData);
    } catch (error) {
      // If JSON parsing fails, try stderr as well
      try {
        const testData = JSON.parse(stderr);
        return this.parseJsonTestResult(testData);
      } catch (stderrError) {
        // Fallback to text parsing if JSON parsing fails
        return this.parseTextTestResult(stdout, stderr);
      }
    }
  }

  /**
   * Parse JSON test results
   * @param {Object} testData - JSON test data
   * @returns {Object} Parsed result
   */
  parseJsonTestResult(testData) {
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
   * Parse text test results (fallback)
   * @param {string} stdout - Standard output
   * @param {string} stderr - Standard error
   * @returns {Object} Parsed result
   */
  parseTextTestResult(stdout, stderr) {
    const tests = [];
    const lines = stdout.split('\n');
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    for (const line of lines) {
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
   * Parse failed test results
   * @param {string} stdout - Standard output
   * @param {string} stderr - Standard error
   * @returns {Object} Parsed result
   */
  parseFailedTestResult(stdout, stderr) {
    const errors = [];
    const lines = [...stdout.split('\n'), ...stderr.split('\n')];
    
    for (const line of lines) {
      if (line.includes('Error:') || line.includes('error:')) {
        errors.push({
          type: 'test_error',
          message: line.replace(/Error:\s*/i, '').trim(),
          severity: 'error'
        });
      }
    }

    return {
      success: false,
      tests: [],
      errors: errors,
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      },
      timestamp: new Date().toISOString()
    };
  }
}
