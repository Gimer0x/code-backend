import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Admin Compilation Manager
 * Handles compilation for admin course projects only
 */
export class AdminCompilationManager {
  constructor() {
    this.basePath = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, './foundry-projects');
  }

  /**
   * Compile code in a course project context
   * @param {string} courseId - Course ID
   * @param {string} code - Solidity code to compile
   * @param {string} contractName - Contract name (optional)
   * @param {Object} options - Compilation options
   * @returns {Promise<Object>} Compilation result
   */
  async compileCode(courseId, code, contractName = 'CompileContract', options = {}) {
    try {
      const courseProjectPath = path.join(this.basePath, `course-${courseId}`);
      
      // Check if course project exists
      try {
        await fs.access(courseProjectPath);
      } catch (error) {
        throw new Error(`Course project not found: ${courseId}`);
      }

      // Create temporary compilation directory outside the course project
      const tempCompileDir = path.join(this.basePath, '.temp-compile', `course-${courseId}-${Date.now()}`);
      await fs.mkdir(tempCompileDir, { recursive: true });
      
      // Copy course project files to temp directory
      await this.copyCourseProjectToTemp(courseProjectPath, tempCompileDir);

      // Write the code to compile
      const contractFileName = `${contractName}.sol`;
      const contractPath = path.join(tempCompileDir, 'src', contractFileName);
      await fs.writeFile(contractPath, code, 'utf8');
      
      // Clean up test files to avoid conflicts
      await this.cleanupTestFiles(tempCompileDir);
      
      // Compile the code
      const compilationResult = await this.runCompilation(tempCompileDir, options);
      
      // Parse compilation results
      const parsedResult = this.parseCompilationResult(compilationResult);
      
      // Clean up temporary directory
      await fs.rm(tempCompileDir, { recursive: true, force: true });
      
      return {
        success: parsedResult.success,
        result: parsedResult,
        courseId,
        contractName: contractFileName,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Admin compilation error:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Copy course project files to temporary directory
   * @param {string} courseProjectPath - Course project path
   * @param {string} tempDir - Temporary directory path
   */
  async copyCourseProjectToTemp(courseProjectPath, tempDir) {
    try {
      await fs.cp(courseProjectPath, tempDir, { 
        recursive: true,
        filter: (src) => !src.includes('.temp-compile') && !src.includes('.git')
      });
    } catch (error) {
      console.error('Error copying course project:', error);
      throw error;
    }
  }

  /**
   * Clean up test files to avoid conflicts
   * @param {string} tempDir - Temporary directory path
   */
  async cleanupTestFiles(tempDir) {
    try {
      const testDir = path.join(tempDir, 'test');
      const testFiles = await fs.readdir(testDir);
      for (const file of testFiles) {
        if (file.endsWith('.t.sol')) {
          await fs.unlink(path.join(testDir, file));
        }
      }
    } catch (error) {
      // Test directory might not exist, continue
    }
  }

  /**
   * Run Foundry compilation
   * @param {string} tempDir - Temporary directory path
   * @param {Object} options - Compilation options
   * @returns {Promise<Object>} Compilation result
   */
  async runCompilation(tempDir, options = {}) {
    return new Promise((resolve, reject) => {
      const args = ['build', '--force'];
      if (options.verbose) {
        args.push('--verbose');
      }
      if (options.extraOutput) {
        args.push('--extra-output', options.extraOutput);
      }

      const process = spawn('forge', args, {
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
   * Parse compilation result
   * @param {Object} result - Raw compilation result
   * @returns {Object} Parsed compilation result
   */
  parseCompilationResult(result) {
    const { success, stdout, stderr } = result;
    
    // Parse errors from both stdout and stderr
    const allErrors = [
      ...this.parseErrors(stdout),
      ...this.parseErrors(stderr)
    ];
    
    // Parse warnings from both stdout and stderr
    const allWarnings = [
      ...this.parseWarnings(stdout),
      ...this.parseWarnings(stderr)
    ];
    
    // Deduplicate errors based on file, line, column, and message
    const errors = this.deduplicateErrors(allErrors);
    
    // Deduplicate warnings based on file, line, column, and message
    const warnings = this.deduplicateWarnings(allWarnings);
    
    if (success) {
      return {
        success: true,
        output: this.parseSuccessfulOutput(stdout),
        warnings: warnings,
        timestamp: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        errors: errors,
        warnings: warnings,
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
    return {
      artifacts: this.extractArtifacts(stdout),
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
   * @param {string} output - Standard output or error output
   * @returns {Array} List of errors
   */
  parseErrors(output) {
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
   * Parse compilation warnings
   * @param {string} output - Standard output or error output
   * @returns {Array} List of warnings
   */
  parseWarnings(output) {
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
   * Deduplicate errors based on file, line, column, and message
   * @param {Array} errors - Array of error objects
   * @returns {Array} Deduplicated errors
   */
  deduplicateErrors(errors) {
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
   * Deduplicate warnings based on file, line, column, and message
   * @param {Array} warnings - Array of warning objects
   * @returns {Array} Deduplicated warnings
   */
  deduplicateWarnings(warnings) {
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
