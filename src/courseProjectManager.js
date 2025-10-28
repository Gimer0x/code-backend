import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CourseProjectManager {
  constructor() {
    // Use local paths for development, Docker paths for production
    this.basePath = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, './foundry-projects');
    this.templatesPath = process.env.TEMPLATES_DIR || path.join(__dirname, '../../templates');
    this.studentSessionsPath = process.env.STUDENT_SESSIONS_DIR || path.join(__dirname, '../../student-sessions');
  }

  /**
   * Initialize a course project with dependencies and configuration
   * @param {string} courseId - Course ID
   * @param {Object} config - Course configuration
   * @returns {Promise<Object>} Project initialization result
   */
  async initializeCourseProject(courseId, config) {
    try {
      const projectPath = path.join(this.basePath, courseId);
      
      // Create project directory
      await this.createProjectDirectory(projectPath);
      
      // Initialize Foundry project
      await this.initializeFoundryProject(projectPath);
      
      // Install dependencies
      await this.installDependencies(projectPath, config.dependencies || []);
      
      // Create foundry.toml configuration
      await this.createFoundryConfig(projectPath, config.foundryConfig);
      
      // Create remappings.txt
      await this.createRemappings(projectPath, config.remappings);
      
      // Copy templates
      await this.copyTemplates(projectPath, config.templates || []);
      
      return {
        success: true,
        projectPath,
        message: `Course project ${courseId} initialized successfully`
      };
    } catch (error) {
      console.error('Error initializing course project:', error);
      return {
        success: false,
        error: error.message,
        message: `Failed to initialize course project ${courseId}`
      };
    }
  }

  /**
   * Create project directory structure
   * @param {string} projectPath - Project directory path
   */
  async createProjectDirectory(projectPath) {
    const directories = [
      projectPath,
      path.join(projectPath, 'src'),
      path.join(projectPath, 'test'),
      path.join(projectPath, 'script'),
      path.join(projectPath, 'lib')
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Initialize Foundry project
   * @param {string} projectPath - Project directory path
   */
  async initializeFoundryProject(projectPath) {
    return new Promise((resolve, reject) => {
      const process = spawn('forge', ['init', '--force'], {
        cwd: projectPath,
        stdio: 'pipe'
      });

      let output = '';
      let error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ output, success: true });
        } else {
          reject(new Error(`Foundry init failed: ${error}`));
        }
      });
    });
  }

  /**
   * Install project dependencies
   * @param {string} projectPath - Project directory path
   * @param {Array} dependencies - List of dependencies to install
   */
  async installDependencies(projectPath, dependencies) {
    const results = [];
    
    for (const dep of dependencies) {
      try {
        const result = await this.installDependency(projectPath, dep);
        results.push({ name: dep.name, success: true, result });
      } catch (error) {
        console.error(`Failed to install ${dep.name}:`, error);
        results.push({ name: dep.name, success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Install a single dependency
   * @param {string} projectPath - Project directory path
   * @param {Object} dependency - Dependency configuration
   */
  async installDependency(projectPath, dependency) {
    return new Promise((resolve, reject) => {
      const process = spawn('forge', ['install', dependency.source], {
        cwd: projectPath,
        stdio: 'pipe'
      });

      let output = '';
      let error = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve({ output, success: true });
        } else {
          reject(new Error(`Failed to install ${dependency.name}: ${error}`));
        }
      });
    });
  }

  /**
   * Create foundry.toml configuration file
   * @param {string} projectPath - Project directory path
   * @param {Object} config - Foundry configuration
   */
  async createFoundryConfig(projectPath, config) {
    const foundryTomlPath = path.join(projectPath, 'foundry.toml');
    
    const foundryConfig = this.generateFoundryToml(config);
    await fs.writeFile(foundryTomlPath, foundryConfig, 'utf8');
  }

  /**
   * Generate foundry.toml content
   * @param {Object} config - Foundry configuration
   * @returns {string} Foundry.toml content
   */
  generateFoundryToml(config) {
    const defaultConfig = {
      solc: "0.8.30",
      optimizer: true,
      optimizer_runs: 200,
      via_ir: false,
      evm_version: "london",
      extra_output: ["metadata"],
      extra_output_files: ["metadata"],
      bytecode_hash: "none",
      cbor_metadata: true,
      verbosity: 1,
      ffi: false,
      build_info: true
    };

    const finalConfig = { ...defaultConfig, ...config };
    
    let toml = '[profile.default]\n';
    toml += `src = "src"\n`;
    toml += `out = "out"\n`;
    toml += `libs = ["lib"]\n`;
    toml += `solc = "${finalConfig.solc}"\n`;
    toml += `optimizer = ${finalConfig.optimizer}\n`;
    toml += `optimizer_runs = ${finalConfig.optimizer_runs}\n`;
    
    // Advanced compiler settings
    if (finalConfig.via_ir !== undefined) {
      toml += `via_ir = ${finalConfig.via_ir}\n`;
    }
    
    if (finalConfig.evm_version) {
      toml += `evm_version = "${finalConfig.evm_version}"\n`;
    }
    
    // Output settings
    if (finalConfig.extra_output && finalConfig.extra_output.length > 0) {
      toml += `extra_output = [${finalConfig.extra_output.map(output => `"${output}"`).join(', ')}]\n`;
    }
    
    if (finalConfig.extra_output_files && finalConfig.extra_output_files.length > 0) {
      toml += `extra_output_files = [${finalConfig.extra_output_files.map(file => `"${file}"`).join(', ')}]\n`;
    }
    
    if (finalConfig.bytecode_hash) {
      toml += `bytecode_hash = "${finalConfig.bytecode_hash}"\n`;
    }
    
    if (finalConfig.cbor_metadata !== undefined) {
      toml += `cbor_metadata = ${finalConfig.cbor_metadata}\n`;
    }
    
    // Gas reporting
    if (finalConfig.gas_reports && finalConfig.gas_reports.length > 0) {
      toml += `gas_reports = [${finalConfig.gas_reports.map(report => `"${report}"`).join(', ')}]\n`;
    }
    
    if (finalConfig.gas_reports_ignore && finalConfig.gas_reports_ignore.length > 0) {
      toml += `gas_reports_ignore = [${finalConfig.gas_reports_ignore.map(ignore => `"${ignore}"`).join(', ')}]\n`;
    }
    
    // Advanced settings
    if (finalConfig.verbosity !== undefined) {
      toml += `verbosity = ${finalConfig.verbosity}\n`;
    }
    
    if (finalConfig.ffi !== undefined) {
      toml += `ffi = ${finalConfig.ffi}\n`;
    }
    
    if (finalConfig.build_info !== undefined) {
      toml += `build_info = ${finalConfig.build_info}\n`;
    }
    
    // Metadata
    if (finalConfig.metadata && Object.keys(finalConfig.metadata).length > 0) {
      toml += '\n[profile.default.metadata]\n';
      for (const [key, value] of Object.entries(finalConfig.metadata)) {
        toml += `${key} = "${value}"\n`;
      }
    }

    return toml;
  }

  /**
   * Create remappings.txt file
   * @param {string} projectPath - Project directory path
   * @param {Object} remappings - Remappings configuration
   */
  async createRemappings(projectPath, remappings) {
    const remappingsPath = path.join(projectPath, 'remappings.txt');
    
    let remappingsContent = '';
    for (const [key, value] of Object.entries(remappings)) {
      remappingsContent += `${key} ${value}\n`;
    }
    
    await fs.writeFile(remappingsPath, remappingsContent, 'utf8');
  }

  /**
   * Copy project templates
   * @param {string} projectPath - Project directory path
   * @param {Array} templates - List of templates to copy
   */
  async copyTemplates(projectPath, templates) {
    for (const template of templates) {
      try {
        await this.copyTemplate(projectPath, template);
      } catch (error) {
        console.error(`Failed to copy template ${template.name}:`, error);
      }
    }
  }

  /**
   * Copy a single template
   * @param {string} projectPath - Project directory path
   * @param {Object} template - Template configuration
   */
  async copyTemplate(projectPath, template) {
    const templatePath = path.join(this.templatesPath, template.templatePath);
    const destPath = path.join(projectPath, template.destination || 'src');
    
    // Create destination directory
    await fs.mkdir(destPath, { recursive: true });
    
    // Copy template files
    await this.copyDirectory(templatePath, destPath);
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
   * Get course project status
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Project status
   */
  async getCourseProjectStatus(courseId) {
    try {
      const projectPath = path.join(this.basePath, courseId);
      
      // Check if project exists
      const exists = await this.directoryExists(projectPath);
      if (!exists) {
        return {
          exists: false,
          message: `Course project ${courseId} does not exist`
        };
      }

      // Check foundry.toml
      const foundryTomlExists = await this.fileExists(path.join(projectPath, 'foundry.toml'));
      
      // Check remappings.txt
      const remappingsExists = await this.fileExists(path.join(projectPath, 'remappings.txt'));
      
      // Check lib directory
      const libExists = await this.directoryExists(path.join(projectPath, 'lib'));
      
      // List installed dependencies
      const dependencies = await this.getInstalledDependencies(projectPath);

      return {
        exists: true,
        foundryToml: foundryTomlExists,
        remappings: remappingsExists,
        lib: libExists,
        dependencies,
        projectPath
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message,
        message: `Failed to get project status for ${courseId}`
      };
    }
  }

  /**
   * Get installed dependencies
   * @param {string} projectPath - Project directory path
   * @returns {Promise<Array>} List of installed dependencies
   */
  async getInstalledDependencies(projectPath) {
    try {
      const libPath = path.join(projectPath, 'lib');
      const entries = await fs.readdir(libPath, { withFileTypes: true });
      
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => ({
          name: entry.name,
          path: path.join(libPath, entry.name)
        }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if directory exists
   * @param {string} dirPath - Directory path
   * @returns {Promise<boolean>} True if directory exists
   */
  async directoryExists(dirPath) {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if file exists
   * @param {string} filePath - File path
   * @returns {Promise<boolean>} True if file exists
   */
  async fileExists(filePath) {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }
}
