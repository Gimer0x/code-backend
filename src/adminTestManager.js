import { exec, spawn } from 'child_process';
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
    this.basePath = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, '../foundry-projects');
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
    const contractFileName = `${contractName}.sol`;
    const testFileName = `${contractName}.t.sol`;
    const courseProjectPath = path.join(this.basePath, `course-${courseId}`);
    const contractPath = path.join(courseProjectPath, 'src', contractFileName);
    const testPath = path.join(courseProjectPath, 'test', testFileName);
    let tempContractCreated = false;
    let tempTestCreated = false;
    let originalContractContent = null;
    let originalTestContent = null;
    
    try {
      // Check if course project exists
      try {
        await fs.access(courseProjectPath);
      } catch (error) {
        throw new Error(`Course project not found: ${courseId}`);
      }

      // Ensure directories exist
      await fs.mkdir(path.join(courseProjectPath, 'src'), { recursive: true });
      await fs.mkdir(path.join(courseProjectPath, 'test'), { recursive: true });

      // Backup existing files if they exist
      try {
        originalContractContent = await fs.readFile(contractPath, 'utf8');
      } catch {}
      try {
        originalTestContent = await fs.readFile(testPath, 'utf8');
      } catch {}

      // Write the test code directly in the course project FIRST
      // We'll compile the test file before writing the contract code
      await fs.writeFile(testPath, testCode, 'utf8');
      tempTestCreated = true;
      
      // Ensure remappings.txt exists for proper import resolution
      await this.ensureRemappingsFile(courseProjectPath);
      
      // Clean up existing test files to avoid conflicts (except our test file)
      // IMPORTANT: Do this AFTER writing our test file to ensure it's not deleted
      await this.cleanupExistingTests(courseProjectPath, testFileName);
      
      // STEP 1: Write contract code FIRST (even if it exists, we'll overwrite it)
      // This ensures test compilation uses the correct contract code
      await fs.writeFile(contractPath, code, 'utf8');
      tempContractCreated = true;
      
      // STEP 2: Compile test file to check if it's valid
      const testCompilationResult = await this.compileTestFile(courseProjectPath, testFileName);
      
      if (!testCompilationResult.success || testCompilationResult.exitCode !== 0) {
        // Test file compilation failed, return compilation errors
        const compilationErrors = this.extractCompilationErrors(
          testCompilationResult.stdout, 
          testCompilationResult.stderr
        );
        
        return {
          success: false,
          code: 'TEST_COMPILATION_FAILED',
          error: 'Test file failed to compile',
          message: 'The test file has compilation errors. Please fix them before running tests.',
          errors: compilationErrors,
          result: {
            success: false,
            tests: [],
            errors: compilationErrors,
            summary: {
              total: 0,
              passed: 0,
              failed: 0
            },
            timestamp: new Date().toISOString(),
            message: 'Test file failed to compile'
          },
          courseId,
          contractName: contractFileName,
          testFileName: testFileName,
          timestamp: new Date().toISOString()
        };
      }
      
      // STEP 3: Test compilation succeeded, now run tests
      // Contract code is already written, so we can run tests directly
      // Verify files are still there before running tests
      const testFileStillExists = await fs.access(testPath).then(() => true).catch(() => false);
      if (!testFileStillExists) {
        throw new Error(`Test file was deleted before running tests: ${testFileName}`);
      }
      
      // STEP 4: Run tests directly in the course project directory
      // Use --match-path to run only this specific test file
      const testResult = await this.runTests(courseProjectPath, testFileName);
      
      // Debug: Log raw output to help diagnose issues
      if (process.env.NODE_ENV === 'development') {
        console.log(`[ADMIN TEST] Test execution completed: exitCode=${testResult.exitCode}`);
        console.log(`[ADMIN TEST] stdout length: ${testResult.stdout?.length || 0}`);
        console.log(`[ADMIN TEST] stderr length: ${testResult.stderr?.length || 0}`);
        if (testResult.stdout) {
          try {
            const testData = JSON.parse(testResult.stdout);
            console.log(`[ADMIN TEST] JSON keys: ${Object.keys(testData).join(', ')}`);
            // Log first test contract structure
            const firstKey = Object.keys(testData)[0];
            if (firstKey) {
              console.log(`[ADMIN TEST] First contract: ${firstKey}`);
              if (testData[firstKey]?.test_results) {
                const testNames = Object.keys(testData[firstKey].test_results);
                console.log(`[ADMIN TEST] Test names found: ${testNames.join(', ')}`);
              }
            }
          } catch (e) {
            console.log(`[ADMIN TEST] Failed to parse JSON: ${e.message}`);
            console.log(`[ADMIN TEST] stdout sample: ${testResult.stdout.substring(0, 500)}`);
          }
        }
      }
      
      // Parse test results
      const parsedResult = this.parseTestResult(testResult);
      
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
    } finally {
      // Clean up: restore original files or remove temporary files
      try {
        if (tempContractCreated) {
          if (originalContractContent !== null) {
            await fs.writeFile(contractPath, originalContractContent, 'utf8');
          } else {
            await fs.unlink(contractPath).catch(() => {});
          }
        }
        if (tempTestCreated) {
          if (originalTestContent !== null) {
            await fs.writeFile(testPath, originalTestContent, 'utf8');
          } else {
            await fs.unlink(testPath).catch(() => {});
          }
        }
      } catch (cleanupError) {
        // Non-fatal cleanup error
        console.error('Cleanup error (non-fatal):', cleanupError.message);
      }
    }
  }

  /**
   * Ensure remappings.txt file exists for proper import resolution
   * @param {string} projectDir - Project directory path
   */
  async ensureRemappingsFile(projectDir) {
    const remappingsPath = path.join(projectDir, 'remappings.txt');
    try {
      // Check if remappings.txt exists
      await fs.access(remappingsPath);
      // File exists, no need to create
    } catch {
      // File doesn't exist, generate it using forge remappings
      try {
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        
        // Get remappings from forge
        const { stdout } = await execAsync('forge remappings', { cwd: projectDir });
        if (stdout && stdout.trim()) {
          await fs.writeFile(remappingsPath, stdout.trim(), 'utf8');
        }
      } catch (error) {
        // If forge remappings fails, create basic remappings manually
        const libDir = path.join(projectDir, 'lib');
        const openzeppelinPath = path.join(libDir, 'openzeppelin-contracts');
        const forgeStdPath = path.join(libDir, 'forge-std');
        
        const remappings = [];
        try {
          await fs.access(openzeppelinPath);
          remappings.push('@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/');
          remappings.push('openzeppelin-contracts/=lib/openzeppelin-contracts/');
        } catch {}
        
        try {
          await fs.access(forgeStdPath);
          remappings.push('forge-std/=lib/forge-std/src/');
        } catch {}
        
        if (remappings.length > 0) {
          await fs.writeFile(remappingsPath, remappings.join('\n'), 'utf8');
        }
      }
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
   * @param {string} projectDir - Project directory path
   * @param {string} excludeFile - Test file to keep
   */
  async cleanupExistingTests(projectDir, excludeFile) {
    try {
      const testDir = path.join(projectDir, 'test');
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
   * Compile test file to check if it's valid before running tests
   * @param {string} projectDir - Project directory path
   * @param {string} testFileName - Test file name
   * @returns {Promise<Object>} Compilation result
   */
  async compileTestFile(projectDir, testFileName) {
    return new Promise((resolve, reject) => {
      // Use forge build to compile test files
      // Note: forge build doesn't support --match-path, so we compile all files
      // Since we've already cleaned up other test files, only our test file will be compiled
      const process = spawn('forge', ['build', '--force'], {
        cwd: projectDir,
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
   * Run Foundry tests
   * @param {string} projectDir - Project directory path
   * @param {string} testFileName - Test file name to run (optional, if not provided runs all tests)
   * @returns {Promise<Object>} Test result
   */
  async runTests(projectDir, testFileName = null) {
    return new Promise((resolve, reject) => {
      const args = ['test', '--json'];
      // If testFileName is provided, use --match-path to run only that test file
      if (testFileName) {
        args.push('--match-path', `test/${testFileName}`);
      }
      
      const process = spawn('forge', args, {
        cwd: projectDir,
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
    const { success, stdout, stderr, exitCode } = result;
    
    // Check if output looks like compilation errors (not JSON)
    const isCompilationError = exitCode !== 0 && 
      (stdout.includes('Compiler run') || 
       stdout.includes('Error:') ||
       stderr.includes('Error:') ||
       (!stdout.trim().startsWith('{') && !stdout.trim().startsWith('[')));
    
    if (isCompilationError) {
      // Extract compilation errors from output
      const compilationErrors = this.extractCompilationErrors(stdout, stderr);
      
      return {
        success: false,
        tests: [],
        errors: compilationErrors,
        summary: {
          total: 0,
          passed: 0,
          failed: 0
        },
        timestamp: new Date().toISOString(),
        message: 'Test file failed to compile'
      };
    }
    
    // Try to parse JSON output regardless of success/failure
    // Forge test --json outputs JSON even when tests fail
    try {
      if (!stdout || stdout.trim().length === 0) {
        throw new Error('Empty stdout');
      }
      const testData = JSON.parse(stdout);
      const parsed = this.parseJsonTestResult(testData);
      
      // If no tests found and exit code is non-zero, check for compilation errors
      if (parsed.summary.total === 0 && exitCode !== 0) {
        // Check if stdout/stderr contains compilation errors
        const compilationErrors = this.extractCompilationErrors(stdout, stderr);
        if (compilationErrors.length > 0) {
          return {
            success: false,
            tests: [],
            errors: compilationErrors,
            summary: {
              total: 0,
              passed: 0,
              failed: 0
            },
            timestamp: new Date().toISOString(),
            message: 'Test file failed to compile'
          };
        }
      }
      
      return parsed;
    } catch (error) {
      // If JSON parsing fails, try stderr as well
      try {
        if (stderr && stderr.trim().length > 0) {
          const testData = JSON.parse(stderr);
          return this.parseJsonTestResult(testData);
        }
      } catch (stderrError) {
        // Fallback to text parsing if JSON parsing fails
        return this.parseTextTestResult(stdout, stderr, exitCode);
      }
      
      // Fallback to text parsing
      return this.parseTextTestResult(stdout, stderr, exitCode);
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
    // Format: { "test/SetValue.t.sol:SetValueTest": { "test_results": { "testName()": {...} } } }
    for (const [testContract, contractData] of Object.entries(testData)) {
      if (contractData && contractData.test_results) {
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
      success: failedTests === 0 && totalTests > 0,
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
   * Extract compilation errors from test compilation output
   * @param {string} stdout - Standard output
   * @param {string} stderr - Standard error
   * @returns {Array} Array of compilation errors
   */
  extractCompilationErrors(stdout, stderr) {
    const errors = [];
    const allLines = (stdout || '').split('\n').concat((stderr || '').split('\n'));
    
    let currentError = null;
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      
      // Match Solidity error format: "Error (7576): Undeclared identifier."
      const errorMatch = line.match(/Error\s*\((\d+)\):\s*(.+)/);
      if (errorMatch) {
        if (currentError) {
          errors.push(currentError);
        }
        currentError = {
          type: 'compilation_error',
          code: errorMatch[1],
          message: errorMatch[2].trim(),
          severity: 'error',
          source: 'test_compilation'
        };
        
        // Look ahead for file location
        for (let j = i + 1; j < Math.min(i + 5, allLines.length); j++) {
          const nextLine = allLines[j];
          if (nextLine.includes('-->') && nextLine.includes('.sol:')) {
            const locationMatch = nextLine.match(/-->\s+(.+):(\d+):(\d+):/);
            if (locationMatch) {
              currentError.file = locationMatch[1];
              currentError.line = parseInt(locationMatch[2]);
              currentError.column = parseInt(locationMatch[3]);
              break;
            }
          }
        }
        continue;
      }
      
      // Match simple error format: "Error: ..."
      if (line.includes('Error:') || line.includes('error:')) {
        if (currentError) {
          errors.push(currentError);
        }
        currentError = {
          message: line.replace(/Error:\s*/i, '').trim(),
          severity: 'error',
          source: 'test_compilation'
        };
      } else if (currentError && line.trim() && !line.includes('-->')) {
        // Append to current error message (skip location lines)
        currentError.message += '\n' + line.trim();
      }
      
      // Match file locations (e.g., " --> test/SetValueTest.t.sol:4:5:")
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
    if (errors.length === 0 && (stdout || stderr)) {
      const errorText = (stdout || stderr).trim();
      if (errorText && !errorText.startsWith('{')) {
        errors.push({
          message: errorText,
          severity: 'error',
          source: 'test_compilation'
        });
      }
    }
    
    return errors;
  }

  /**
   * Parse text test results (fallback)
   * @param {string} stdout - Standard output
   * @param {string} stderr - Standard error
   * @param {number} exitCode - Exit code from forge command
   * @returns {Object} Parsed result
   */
  parseTextTestResult(stdout, stderr, exitCode = 0) {
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
