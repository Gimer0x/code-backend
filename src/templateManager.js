import { promises as fs } from 'fs';
import path from 'path';

export class TemplateManager {
  constructor() {
    this.templatesPath = process.env.TEMPLATES_DIR || '/app/templates';
    this.basePath = process.env.FOUNDRY_CACHE_DIR || '/app/course-projects';
  }

  /**
   * Create a template for a course project
   * @param {string} templateName - Template name
   * @param {Object} templateConfig - Template configuration
   * @returns {Promise<Object>} Template creation result
   */
  async createTemplate(templateName, templateConfig) {
    try {
      const templatePath = path.join(this.templatesPath, templateName);
      
      // Create template directory
      await fs.mkdir(templatePath, { recursive: true });
      
      // Create template files
      await this.createTemplateFiles(templatePath, templateConfig);
      
      return {
        success: true,
        templateName,
        templatePath,
        message: `Template ${templateName} created successfully`
      };
    } catch (error) {
      console.error(`Error creating template ${templateName}:`, error);
      return {
        success: false,
        templateName,
        error: error.message,
        message: `Failed to create template ${templateName}`
      };
    }
  }

  /**
   * Create template files
   * @param {string} templatePath - Template directory path
   * @param {Object} templateConfig - Template configuration
   */
  async createTemplateFiles(templatePath, templateConfig) {
    const { files = [], directories = [] } = templateConfig;
    
    // Create directories
    for (const dir of directories) {
      const dirPath = path.join(templatePath, dir);
      await fs.mkdir(dirPath, { recursive: true });
    }
    
    // Create files
    for (const file of files) {
      const filePath = path.join(templatePath, file.name);
      const content = this.generateFileContent(file);
      await fs.writeFile(filePath, content, 'utf8');
    }
  }

  /**
   * Generate file content based on template
   * @param {Object} file - File configuration
   * @returns {string} File content
   */
  generateFileContent(file) {
    switch (file.type) {
      case 'solidity-contract':
        return this.generateSolidityContract(file);
      case 'solidity-test':
        return this.generateSolidityTest(file);
      case 'foundry-config':
        return this.generateFoundryConfig(file);
      case 'remappings':
        return this.generateRemappings(file);
      case 'readme':
        return this.generateReadme(file);
      default:
        return file.content || '';
    }
  }

  /**
   * Generate Solidity contract template
   * @param {Object} file - File configuration
   * @returns {string} Solidity contract content
   */
  generateSolidityContract(file) {
    const { contractName, pragma, imports, contractContent } = file;
    
    let content = `// SPDX-License-Identifier: MIT\n`;
    content += `pragma solidity ${pragma || '^0.8.30'};\n\n`;
    
    if (imports && imports.length > 0) {
      for (const importPath of imports) {
        content += `import "${importPath}";\n`;
      }
      content += '\n';
    }
    
    content += `contract ${contractName} {\n`;
    content += contractContent || '    // Contract implementation here\n';
    content += '}\n';
    
    return content;
  }

  /**
   * Generate Solidity test template
   * @param {Object} file - File configuration
   * @returns {string} Solidity test content
   */
  generateSolidityTest(file) {
    const { testName, imports, testContent } = file;
    
    let content = `// SPDX-License-Identifier: MIT\n`;
    content += `pragma solidity ^0.8.30;\n\n`;
    
    if (imports && imports.length > 0) {
      for (const importPath of imports) {
        content += `import "${importPath}";\n`;
      }
      content += '\n';
    }
    
    content += `contract ${testName} is Test {\n`;
    content += testContent || '    // Test implementation here\n';
    content += '}\n';
    
    return content;
  }

  /**
   * Generate Foundry configuration
   * @param {Object} file - File configuration
   * @returns {string} Foundry.toml content
   */
  generateFoundryConfig(file) {
    const { config } = file;
    const defaultConfig = {
      src: 'src',
      out: 'out',
      libs: ['lib'],
      solc: '0.8.30',
      optimizer: true,
      optimizer_runs: 200
    };
    
    const finalConfig = { ...defaultConfig, ...config };
    
    let toml = '[profile.default]\n';
    toml += `src = "${finalConfig.src}"\n`;
    toml += `out = "${finalConfig.out}"\n`;
    toml += `libs = [${finalConfig.libs.map(lib => `"${lib}"`).join(', ')}]\n`;
    toml += `solc = "${finalConfig.solc}"\n`;
    toml += `optimizer = ${finalConfig.optimizer}\n`;
    toml += `optimizer_runs = ${finalConfig.optimizer_runs}\n`;
    
    return toml;
  }

  /**
   * Generate remappings
   * @param {Object} file - File configuration
   * @returns {string} Remappings content
   */
  generateRemappings(file) {
    const { remappings } = file;
    let content = '';
    
    for (const [key, value] of Object.entries(remappings)) {
      content += `${key} ${value}\n`;
    }
    
    return content;
  }

  /**
   * Generate README
   * @param {Object} file - File configuration
   * @returns {string} README content
   */
  generateReadme(file) {
    const { title, description, instructions } = file;
    
    let content = `# ${title}\n\n`;
    content += `${description}\n\n`;
    
    if (instructions && instructions.length > 0) {
      content += '## Instructions\n\n';
      for (const instruction of instructions) {
        content += `- ${instruction}\n`;
      }
      content += '\n';
    }
    
    content += '## Getting Started\n\n';
    content += '1. Install dependencies: `forge install`\n';
    content += '2. Build: `forge build`\n';
    content += '3. Test: `forge test`\n';
    
    return content;
  }

  /**
   * Apply template to a course project
   * @param {string} courseId - Course ID
   * @param {string} templateName - Template name
   * @param {Object} options - Template options
   * @returns {Promise<Object>} Template application result
   */
  async applyTemplate(courseId, templateName, options = {}) {
    try {
      const projectPath = path.join(this.basePath, courseId);
      const templatePath = path.join(this.templatesPath, templateName);
      
      // Check if template exists
      if (!await this.templateExists(templateName)) {
        throw new Error(`Template ${templateName} does not exist`);
      }
      
      // Check if project exists
      if (!await this.projectExists(projectPath)) {
        throw new Error(`Course project ${courseId} does not exist`);
      }
      
      // Copy template files to project
      await this.copyTemplateToProject(templatePath, projectPath, options);
      
      return {
        success: true,
        courseId,
        templateName,
        message: `Template ${templateName} applied to course ${courseId}`
      };
    } catch (error) {
      console.error(`Error applying template ${templateName}:`, error);
      return {
        success: false,
        courseId,
        templateName,
        error: error.message,
        message: `Failed to apply template ${templateName}`
      };
    }
  }

  /**
   * Copy template to project
   * @param {string} templatePath - Template directory path
   * @param {string} projectPath - Project directory path
   * @param {Object} options - Copy options
   */
  async copyTemplateToProject(templatePath, projectPath, options = {}) {
    const { overwrite = false, exclude = [] } = options;
    
    const entries = await fs.readdir(templatePath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (exclude.includes(entry.name)) {
        continue;
      }
      
      const srcPath = path.join(templatePath, entry.name);
      const destPath = path.join(projectPath, entry.name);
      
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyTemplateToProject(srcPath, destPath, options);
      } else {
        // Check if file exists and overwrite is false
        if (!overwrite && await this.fileExists(destPath)) {
          continue;
        }
        
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Get available templates
   * @returns {Promise<Array>} List of available templates
   */
  async getAvailableTemplates() {
    try {
      const entries = await fs.readdir(this.templatesPath, { withFileTypes: true });
      
      const templates = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const templateInfo = await this.getTemplateInfo(entry.name);
          templates.push(templateInfo);
        }
      }
      
      return templates;
    } catch (error) {
      console.error('Error getting available templates:', error);
      return [];
    }
  }

  /**
   * Get template information
   * @param {string} templateName - Template name
   * @returns {Promise<Object>} Template information
   */
  async getTemplateInfo(templateName) {
    try {
      const templatePath = path.join(this.templatesPath, templateName);
      const configPath = path.join(templatePath, 'template.json');
      
      let config = {};
      try {
        const configContent = await fs.readFile(configPath, 'utf8');
        config = JSON.parse(configContent);
      } catch {
        // No config file, use defaults
      }
      
      return {
        name: templateName,
        path: templatePath,
        description: config.description || '',
        version: config.version || '1.0.0',
        files: await this.getTemplateFiles(templatePath)
      };
    } catch (error) {
      return {
        name: templateName,
        path: path.join(this.templatesPath, templateName),
        description: '',
        version: '1.0.0',
        files: [],
        error: error.message
      };
    }
  }

  /**
   * Get template files
   * @param {string} templatePath - Template directory path
   * @returns {Promise<Array>} List of template files
   */
  async getTemplateFiles(templatePath) {
    try {
      const files = [];
      await this.scanDirectory(templatePath, files, '');
      return files;
    } catch (error) {
      return [];
    }
  }

  /**
   * Scan directory recursively
   * @param {string} dirPath - Directory path
   * @param {Array} files - Files array
   * @param {string} relativePath - Relative path
   */
  async scanDirectory(dirPath, files, relativePath) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);
      
      if (entry.isDirectory()) {
        await this.scanDirectory(entryPath, files, entryRelativePath);
      } else {
        files.push({
          name: entry.name,
          path: entryRelativePath,
          fullPath: entryPath
        });
      }
    }
  }

  /**
   * Check if template exists
   * @param {string} templateName - Template name
   * @returns {Promise<boolean>} True if template exists
   */
  async templateExists(templateName) {
    try {
      const templatePath = path.join(this.templatesPath, templateName);
      const stat = await fs.stat(templatePath);
      return stat.isDirectory();
    } catch {
      return false;
    }
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
