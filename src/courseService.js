import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class CourseService {
  /**
   * Create a new course with full database persistence
   * @param {Object} courseData - Course data
   * @param {string} creatorId - ID of the user creating the course
   * @returns {Promise<Object>} Course creation result
   */
  async createCourse(courseData, creatorId) {
    try {
      const {
        courseId,
        title,
        language = 'Solidity',
        goals,
        level = 'BEGINNER',
        access = 'FREE',
        thumbnail,
        foundryConfig = {},
        dependencies = [],
        templates = []
      } = courseData;

      if (!courseId || !title || !goals) {
        throw new Error('Course ID, title, and goals are required');
      }

      // Create course in database
      const course = await prisma.course.create({
        data: {
          id: courseId,
          title,
          language,
          goals,
          level: level.toUpperCase(),
          access: access.toUpperCase(),
          thumbnail,
          creatorId,
          status: 'ACTIVE'
        }
      });

      // Create course project record
      const courseProject = await prisma.courseProject.create({
        data: {
          courseId: course.id,
          projectPath: `foundry-projects/course-${courseId}`,
          foundryConfig: foundryConfig,
          isActive: true
        }
      });

      // Add dependencies
      for (const dep of dependencies) {
        await prisma.courseDependency.create({
          data: {
            courseProjectId: courseProject.id,
            name: dep.name,
            version: dep.version || 'latest',
            source: `https://github.com/${dep.name}`,
            isInstalled: false
          }
        });
      }

      // Add templates
      for (const template of templates) {
        await prisma.courseTemplate.create({
          data: {
            courseProjectId: courseProject.id,
            name: template.name,
            description: template.description || '',
            templatePath: `/templates/${template.name}`,
            isDefault: template.isDefault || false
          }
        });
      }

      return {
        success: true,
        course: {
          id: course.id,
          title: course.title,
          language: course.language,
          goals: course.goals,
          level: course.level,
          access: course.access,
          thumbnail: course.thumbnail,
          status: course.status,
          createdAt: course.createdAt,
          updatedAt: course.updatedAt
        },
        project: courseProject,
        message: `Course ${title} created successfully`
      };

    } catch (error) {
      console.error('Course creation error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create course'
      };
    }
  }

  /**
   * Get course by ID with all related data
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Course data
   */
  async getCourse(courseId) {
    try {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          modules: {
            include: {
              lessons: {
                orderBy: { order: 'asc' }
              }
            },
            orderBy: { order: 'asc' }
          },
          courseProject: {
            include: {
              dependencies: true,
              templates: true
            }
          },
          _count: {
            select: {
              modules: true,
              progress: true
            }
          }
        }
      });

      if (!course) {
        throw new Error('Course not found');
      }

      return {
        success: true,
        course
      };

    } catch (error) {
      console.error('Get course error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List all courses with pagination
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Courses list
   */
  async listCourses(options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        level,
        access,
        status = 'ACTIVE'
      } = options;

      const where = { status };
      if (level) where.level = level;
      if (access) where.access = access;

      const [courses, total] = await Promise.all([
        prisma.course.findMany({
          where,
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            _count: {
              select: {
                modules: true,
                progress: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.course.count({ where })
      ]);

      return {
        success: true,
        courses,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      console.error('List courses error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update course
   * @param {string} courseId - Course ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Update result
   */
  async updateCourse(courseId, updateData) {
    try {
      const course = await prisma.course.update({
        where: { id: courseId },
        data: {
          ...updateData,
          updatedAt: new Date()
        }
      });

      return {
        success: true,
        course,
        message: 'Course updated successfully'
      };

    } catch (error) {
      console.error('Update course error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete course
   * @param {string} courseId - Course ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteCourse(courseId) {
    try {
      await prisma.course.delete({
        where: { id: courseId }
      });

      return {
        success: true,
        message: 'Course deleted successfully'
      };

    } catch (error) {
      console.error('Delete course error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
