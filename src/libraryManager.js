import { exec, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

export class LibraryManager {
  constructor() {
    this.basePath = process.env.FOUNDRY_CACHE_DIR || '/app/course-projects';
    this.knownLibraries = {
      'forge-std': {
        source: 'foundry-rs/forge-std',
        remapping: 'forge-std/',
        description: 'Foundry testing framework'
      },
      'openzeppelin-contracts': {
        source: 'OpenZeppelin/openzeppelin-contracts',
        remapping: '@openzeppelin/',
        description: 'OpenZeppelin smart contract library'
      },
      'solmate': {
        source: 'transmissions11/solmate',
        remapping: 'solmate/',
        description: 'Modern, opinionated, and gas optimized building blocks for smart contracts'
      },
      'ds-test': {
        source: 'dapphub/ds-test',
        remapping: 'ds-test/',
        description: 'Dappsys test framework'
      }
    };
  }

  /**
   * Install a library in a course project
   * @param {string} courseId - Course ID
   * @param {string} libraryName - Library name
   * @param {string} version - Optional version
   * @returns {Promise<Object>} Installation result
   */
  async installLibrary(courseId, libraryName, version = null) {
    try {
      const projectPath = path.join(this.basePath, courseId);
      
      // Check if project exists
      if (!await this.projectExists(projectPath)) {
        throw new Error(`Course project ${courseId} does not exist`);
      }

      // Get library configuration
      const libraryConfig = this.knownLibraries[libraryName];
      if (!libraryConfig) {
        throw new Error(`Unknown library: ${libraryName}`);
      }

      // Install the library
      const installResult = await this.installLibraryFromSource(
        projectPath, 
        libraryConfig.source, 
        version
      );

      if (!installResult.success) {
        throw new Error(`Failed to install ${libraryName}: ${installResult.error}`);
      }

      // Update remappings
      await this.updateRemappings(projectPath, libraryName, libraryConfig.remapping);

      return {
        success: true,
        library: libraryName,
        version: installResult.version,
        remapping: libraryConfig.remapping,
        message: `Library ${libraryName} installed successfully`
      };
    } catch (error) {
      console.error(`Error installing library ${libraryName}:`, error);
      return {
        success: false,
        library: libraryName,
        error: error.message,
        message: `Failed to install library ${libraryName}`
      };
    }
  }

  /**
   * Install library from source
   * @param {string} projectPath - Project directory path
   * @param {string} source - Library source (owner/repo)
   * @param {string} version - Optional version
   * @returns {Promise<Object>} Installation result
   */
  async installLibraryFromSource(projectPath, source, version = null) {
    return new Promise((resolve, reject) => {
      const args = ['install', source];

      const process = spawn('forge', args, {
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
          resolve({
            success: true,
            output,
            version: version || 'latest'
          });
        } else {
          reject(new Error(`Forge install failed: ${error}`));
        }
      });
    });
  }

  /**
   * Update remappings.txt file
   * @param {string} projectPath - Project directory path
   * @param {string} libraryName - Library name
   * @param {string} remapping - Remapping string
   */
  async updateRemappings(projectPath, libraryName, remapping) {
    const remappingsPath = path.join(projectPath, 'remappings.txt');
    
    try {
      // Read existing remappings
      let remappings = '';
      try {
        remappings = await fs.readFile(remappingsPath, 'utf8');
      } catch {
        // File doesn't exist, start with empty content
      }

      // Check if remapping already exists
      const lines = remappings.split('\n').filter(line => line.trim());
      const existingRemapping = lines.find(line => line.startsWith(remapping));
      
      if (!existingRemapping) {
        // Add new remapping
        const newRemapping = `${remapping} lib/${libraryName}/`;
        lines.push(newRemapping);
        
        // Write updated remappings
        await fs.writeFile(remappingsPath, lines.join('\n') + '\n', 'utf8');
      }
    } catch (error) {
      console.error('Error updating remappings:', error);
    }
  }

  /**
   * Get installed libraries for a course project
   * @param {string} courseId - Course ID
   * @returns {Promise<Array>} List of installed libraries
   */
  async getInstalledLibraries(courseId) {
    try {
      const projectPath = path.join(this.basePath, courseId);
      
      if (!await this.projectExists(projectPath)) {
        return [];
      }

      const libPath = path.join(projectPath, 'lib');
      const entries = await fs.readdir(libPath, { withFileTypes: true });
      
      const libraries = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const libraryInfo = await this.getLibraryInfo(libPath, entry.name);
          libraries.push(libraryInfo);
        }
      }
      
      return libraries;
    } catch (error) {
      console.error(`Error getting installed libraries for ${courseId}:`, error);
      return [];
    }
  }

  /**
   * Get library information
   * @param {string} libPath - Library directory path
   * @param {string} libraryName - Library name
   * @returns {Promise<Object>} Library information
   */
  async getLibraryInfo(libPath, libraryName) {
    try {
      const libraryPath = path.join(libPath, libraryName);
      const packageJsonPath = path.join(libraryPath, 'package.json');
      
      let version = 'unknown';
      let description = '';
      
      try {
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        version = packageJson.version || 'unknown';
        description = packageJson.description || '';
      } catch {
        // No package.json, try to get version from git
        try {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);
          
          const { stdout } = await execAsync(`cd ${libraryPath} && git describe --tags --always`, { timeout: 5000 });
          version = stdout.trim();
        } catch {
          // Git command failed, keep unknown version
        }
      }
      
      return {
        name: libraryName,
        version,
        description,
        path: libraryPath
      };
    } catch (error) {
      return {
        name: libraryName,
        version: 'unknown',
        description: '',
        path: path.join(libPath, libraryName),
        error: error.message
      };
    }
  }

  /**
   * Remove a library from a course project
   * @param {string} courseId - Course ID
   * @param {string} libraryName - Library name
   * @returns {Promise<Object>} Removal result
   */
  async removeLibrary(courseId, libraryName) {
    try {
      const projectPath = path.join(this.basePath, courseId);
      
      if (!await this.projectExists(projectPath)) {
        throw new Error(`Course project ${courseId} does not exist`);
      }

      const libPath = path.join(projectPath, 'lib', libraryName);
      
      // Remove library directory
      await fs.rm(libPath, { recursive: true, force: true });
      
      // Update remappings
      await this.removeRemapping(projectPath, libraryName);
      
      return {
        success: true,
        library: libraryName,
        message: `Library ${libraryName} removed successfully`
      };
    } catch (error) {
      console.error(`Error removing library ${libraryName}:`, error);
      return {
        success: false,
        library: libraryName,
        error: error.message,
        message: `Failed to remove library ${libraryName}`
      };
    }
  }

  /**
   * Remove remapping from remappings.txt
   * @param {string} projectPath - Project directory path
   * @param {string} libraryName - Library name
   */
  async removeRemapping(projectPath, libraryName) {
    const remappingsPath = path.join(projectPath, 'remappings.txt');
    
    try {
      const remappings = await fs.readFile(remappingsPath, 'utf8');
      const lines = remappings.split('\n').filter(line => 
        line.trim() && !line.includes(`lib/${libraryName}/`)
      );
      
      await fs.writeFile(remappingsPath, lines.join('\n') + '\n', 'utf8');
    } catch (error) {
      console.error('Error removing remapping:', error);
    }
  }

  /**
   * Get available libraries
   * @returns {Object} Available libraries
   */
  getAvailableLibraries() {
    return this.knownLibraries;
  }

  /**
   * Check if project exists
   * @param {string} projectPath - Project directory path
   * @returns {Promise<boolean>} True if project exists
   */
  async projectExists(projectPath) {
    try {
      const stat = await fs.stat(projectPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Install multiple libraries at once
   * @param {string} courseId - Course ID
   * @param {Array} libraries - List of library names
   * @returns {Promise<Array>} Installation results
   */
  async installMultipleLibraries(courseId, libraries) {
    const results = [];
    
    for (const libraryName of libraries) {
      const result = await this.installLibrary(courseId, libraryName);
      results.push(result);
    }
    
    return results;
  }
}
