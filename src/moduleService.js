import { prisma, prismaQuery } from './prismaClient.js';

export class ModuleService {
  /**
   * Create a new module
   * @param {Object} moduleData - Module data
   * @returns {Promise<Object>} Module creation result
   */
  async createModule(moduleData) {
    try {
      const {
        courseId,
        title,
        description,
        order
      } = moduleData;

      if (!courseId || !title || !description) {
        throw new Error('Course ID, title, and description are required');
      }

      // Get the next order number if not provided
      let moduleOrder = order;
      if (!moduleOrder) {
        const lastModule = await prisma.module.findFirst({
          where: { courseId },
          orderBy: { order: 'desc' }
        });
        moduleOrder = lastModule ? lastModule.order + 1 : 1;
      }

      const module = await prisma.module.create({
        data: {
          courseId,
          title,
          description,
          order: moduleOrder
        }
      });

      return {
        success: true,
        module,
        message: `Module ${title} created successfully`
      };

    } catch (error) {
      console.error('Module creation error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create module'
      };
    }
  }

  /**
   * Get module by ID with lessons
   * @param {string} moduleId - Module ID
   * @returns {Promise<Object>} Module data
   */
  async getModule(moduleId) {
    try {
      const module = await prisma.module.findUnique({
        where: { id: moduleId },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              language: true
            }
          },
          lessons: {
            orderBy: { order: 'asc' }
          }
        }
      });

      if (!module) {
        throw new Error('Module not found');
      }

      return {
        success: true,
        module
      };

    } catch (error) {
      console.error('Get module error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List modules for a course
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Modules list
   */
  async listModules(courseId) {
    try {
      const modules = await prisma.module.findMany({
        where: { courseId },
        include: {
          lessons: {
            orderBy: { order: 'asc' }
          },
          _count: {
            select: {
              lessons: true
            }
          }
        },
        orderBy: { order: 'asc' }
      });

      return {
        success: true,
        modules
      };

    } catch (error) {
      console.error('List modules error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update module
   * @param {string} moduleId - Module ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Update result
   */
  async updateModule(moduleId, updateData) {
    try {
      const module = await prisma.module.update({
        where: { id: moduleId },
        data: {
          ...updateData,
          updatedAt: new Date()
        }
      });

      return {
        success: true,
        module,
        message: 'Module updated successfully'
      };

    } catch (error) {
      console.error('Update module error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete module
   * @param {string} moduleId - Module ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteModule(moduleId) {
    try {
      await prisma.module.delete({
        where: { id: moduleId }
      });

      return {
        success: true,
        message: 'Module deleted successfully'
      };

    } catch (error) {
      console.error('Delete module error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reorder modules
   * @param {string} courseId - Course ID
   * @param {Array} moduleOrders - Array of {moduleId, order}
   * @returns {Promise<Object>} Reorder result
   */
  async reorderModules(courseId, moduleOrders) {
    try {
      const updates = moduleOrders.map(({ moduleId, order }) =>
        prisma.module.update({
          where: { id: moduleId },
          data: { order }
        })
      );

      await Promise.all(updates);

      return {
        success: true,
        message: 'Modules reordered successfully'
      };

    } catch (error) {
      console.error('Reorder modules error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
