import { promises as fs } from 'fs';
import path from 'path';
import { CourseProjectManager } from './courseProjectManager.js';
import { LibraryManager } from './libraryManager.js';
import { TemplateManager } from './templateManager.js';

export class CourseManager {
  constructor() {
    this.basePath = process.env.FOUNDRY_CACHE_DIR || '/app/course-projects';
    this.templatesPath = process.env.TEMPLATES_DIR || '/app/templates';
    this.courseProjectManager = new CourseProjectManager();
    this.libraryManager = new LibraryManager();
    this.templateManager = new TemplateManager();
  }

  /**
   * Create a new course with configuration
   * @param {Object} courseData - Course data
   * @returns {Promise<Object>} Course creation result
   */
  async createCourse(courseData) {
    try {
      const {
        id,
        title,
        description,
        language = 'solidity',
        foundryConfig = {},
        dependencies = [],
        templates = [],
        remappings = {}
      } = courseData;

      if (!id || !title) {
        throw new Error('Course ID and title are required');
      }

      // Create course directory
      const coursePath = path.join(this.basePath, id);
      await fs.mkdir(coursePath, { recursive: true });

      // Initialize course project
      const projectResult = await this.courseProjectManager.initializeCourseProject(id, {
        foundryConfig,
        remappings,
        dependencies,
        templates
      });

      if (!projectResult.success) {
        throw new Error(`Failed to initialize course project: ${projectResult.error}`);
      }

      // Create course metadata
      const courseMetadata = {
        id,
        title,
        description,
        language,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'active',
        configuration: {
          foundryConfig,
          dependencies,
          templates,
          remappings
        }
      };

      // Save course metadata
      const metadataPath = path.join(coursePath, 'course.json');
      await fs.writeFile(metadataPath, JSON.stringify(courseMetadata, null, 2), 'utf8');

      return {
        success: true,
        course: courseMetadata,
        projectPath: coursePath,
        message: `Course ${title} created successfully`
      };
    } catch (error) {
      console.error('Error creating course:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create course'
      };
    }
  }

  /**
   * Get course configuration
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Course configuration
   */
  async getCourseConfig(courseId) {
    try {
      const coursePath = path.join(this.basePath, courseId);
      const metadataPath = path.join(coursePath, 'course.json');

      // Check if course exists
      if (!await this.courseExists(courseId)) {
        throw new Error(`Course ${courseId} does not exist`);
      }

      // Read course metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const courseMetadata = JSON.parse(metadataContent);

      // Get project status
      const projectStatus = await this.courseProjectManager.getCourseProjectStatus(courseId);

      // Get installed libraries
      const installedLibraries = await this.libraryManager.getInstalledLibraries(courseId);

      // Get available templates
      const availableTemplates = await this.templateManager.getAvailableTemplates();

      return {
        success: true,
        course: courseMetadata,
        projectStatus,
        installedLibraries,
        availableTemplates,
        message: `Course configuration retrieved for ${courseId}`
      };
    } catch (error) {
      console.error(`Error getting course config for ${courseId}:`, error);
      return {
        success: false,
        error: error.message,
        message: `Failed to get course configuration for ${courseId}`
      };
    }
  }

  /**
   * Update course configuration
   * @param {string} courseId - Course ID
   * @param {Object} config - New configuration
   * @returns {Promise<Object>} Update result
   */
  async updateCourseConfig(courseId, config) {
    try {
      const coursePath = path.join(this.basePath, courseId);
      const metadataPath = path.join(coursePath, 'course.json');

      // Check if course exists
      if (!await this.courseExists(courseId)) {
        throw new Error(`Course ${courseId} does not exist`);
      }

      // Read current metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const courseMetadata = JSON.parse(metadataContent);

      // Update configuration
      const updatedConfig = {
        ...courseMetadata.configuration,
        ...config
      };

      // Update course metadata
      const updatedMetadata = {
        ...courseMetadata,
        configuration: updatedConfig,
        updatedAt: new Date().toISOString()
      };

      // Save updated metadata
      await fs.writeFile(metadataPath, JSON.stringify(updatedMetadata, null, 2), 'utf8');

      // Update project if needed
      if (config.foundryConfig || config.remappings) {
        await this.updateProjectConfiguration(courseId, config);
      }

      // Update dependencies if needed
      if (config.dependencies) {
        await this.updateDependencies(courseId, config.dependencies);
      }

      // Update templates if needed
      if (config.templates) {
        await this.updateTemplates(courseId, config.templates);
      }

      return {
        success: true,
        course: updatedMetadata,
        message: `Course configuration updated for ${courseId}`
      };
    } catch (error) {
      console.error(`Error updating course config for ${courseId}:`, error);
      return {
        success: false,
        error: error.message,
        message: `Failed to update course configuration for ${courseId}`
      };
    }
  }

  /**
   * Update project configuration
   * @param {string} courseId - Course ID
   * @param {Object} config - Configuration to update
   */
  async updateProjectConfiguration(courseId, config) {
    const coursePath = path.join(this.basePath, courseId);

    // Update foundry.toml if needed
    if (config.foundryConfig) {
      const foundryTomlPath = path.join(coursePath, 'foundry.toml');
      const foundryConfig = this.courseProjectManager.generateFoundryToml(config.foundryConfig);
      await fs.writeFile(foundryTomlPath, foundryConfig, 'utf8');
    }

    // Update remappings.txt if needed
    if (config.remappings) {
      const remappingsPath = path.join(coursePath, 'remappings.txt');
      let remappingsContent = '';
      for (const [key, value] of Object.entries(config.remappings)) {
        remappingsContent += `${key} ${value}\n`;
      }
      await fs.writeFile(remappingsPath, remappingsContent, 'utf8');
    }
  }

  /**
   * Update dependencies
   * @param {string} courseId - Course ID
   * @param {Array} dependencies - New dependencies
   */
  async updateDependencies(courseId, dependencies) {
    // Get current installed libraries
    const currentLibraries = await this.libraryManager.getInstalledLibraries(courseId);
    const currentLibraryNames = currentLibraries.map(lib => lib.name);

    // Install new dependencies
    for (const dep of dependencies) {
      if (!currentLibraryNames.includes(dep.name)) {
        await this.libraryManager.installLibrary(courseId, dep.name, dep.version);
      }
    }

    // Remove dependencies not in new list
    for (const currentLib of currentLibraries) {
      const stillNeeded = dependencies.some(dep => dep.name === currentLib.name);
      if (!stillNeeded) {
        await this.libraryManager.removeLibrary(courseId, currentLib.name);
      }
    }
  }

  /**
   * Update templates
   * @param {string} courseId - Course ID
   * @param {Array} templates - New templates
   */
  async updateTemplates(courseId, templates) {
    for (const template of templates) {
      await this.templateManager.applyTemplate(courseId, template.name, template.options);
    }
  }

  /**
   * Get all courses
   * @returns {Promise<Array>} List of courses
   */
  async getAllCourses() {
    try {
      const courses = [];
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const courseId = entry.name;
          const coursePath = path.join(this.basePath, courseId);
          const metadataPath = path.join(coursePath, 'course.json');

          try {
            const metadataContent = await fs.readFile(metadataPath, 'utf8');
            const courseMetadata = JSON.parse(metadataContent);
            courses.push(courseMetadata);
          } catch (error) {
            // Course directory exists but no metadata file
            console.warn(`Course ${courseId} has no metadata file`);
          }
        }
      }

      return {
        success: true,
        courses,
        message: `Retrieved ${courses.length} courses`
      };
    } catch (error) {
      console.error('Error getting all courses:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get courses'
      };
    }
  }

  /**
   * Delete a course
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteCourse(courseId) {
    try {
      const coursePath = path.join(this.basePath, courseId);

      if (!await this.courseExists(courseId)) {
        throw new Error(`Course ${courseId} does not exist`);
      }

      // Remove course directory
      await fs.rm(coursePath, { recursive: true, force: true });

      return {
        success: true,
        courseId,
        message: `Course ${courseId} deleted successfully`
      };
    } catch (error) {
      console.error(`Error deleting course ${courseId}:`, error);
      return {
        success: false,
        error: error.message,
        message: `Failed to delete course ${courseId}`
      };
    }
  }

  /**
   * Check if course exists
   * @param {string} courseId - Course ID
   * @returns {Promise<boolean>} True if course exists
   */
  async courseExists(courseId) {
    try {
      const coursePath = path.join(this.basePath, courseId);
      const metadataPath = path.join(coursePath, 'course.json');
      
      const stat = await fs.stat(metadataPath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Get course statistics
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Course statistics
   */
  async getCourseStats(courseId) {
    try {
      const coursePath = path.join(this.basePath, courseId);
      
      if (!await this.courseExists(courseId)) {
        throw new Error(`Course ${courseId} does not exist`);
      }

      // Get project status
      const projectStatus = await this.courseProjectManager.getCourseProjectStatus(courseId);
      
      // Get installed libraries
      const installedLibraries = await this.libraryManager.getInstalledLibraries(courseId);
      
      // Get available templates
      const availableTemplates = await this.templateManager.getAvailableTemplates();

      // Calculate statistics
      const stats = {
        courseId,
        projectExists: projectStatus.exists,
        foundryConfigured: projectStatus.foundryToml,
        remappingsConfigured: projectStatus.remappings,
        librariesInstalled: installedLibraries.length,
        templatesAvailable: availableTemplates.length,
        dependencies: projectStatus.dependencies || [],
        lastUpdated: new Date().toISOString()
      };

      return {
        success: true,
        stats,
        message: `Course statistics retrieved for ${courseId}`
      };
    } catch (error) {
      console.error(`Error getting course stats for ${courseId}:`, error);
      return {
        success: false,
        error: error.message,
        message: `Failed to get course statistics for ${courseId}`
      };
    }
  }
}
