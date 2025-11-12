import { prisma, prismaQuery } from './prismaClient.js';

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

      // Normalize thumbnail to a relative path if provided
      let normalizedThumbnail = thumbnail;
      if (typeof normalizedThumbnail === 'string' && normalizedThumbnail.length > 0) {
        try {
          // If absolute URL, strip protocol/host and keep path
          if (normalizedThumbnail.startsWith('http://') || normalizedThumbnail.startsWith('https://')) {
            const u = new URL(normalizedThumbnail);
            normalizedThumbnail = u.pathname;
          }
          // Ensure it starts with '/uploads'
          if (normalizedThumbnail && !normalizedThumbnail.startsWith('/uploads')) {
            const idx = normalizedThumbnail.indexOf('/uploads');
            if (idx !== -1) normalizedThumbnail = normalizedThumbnail.slice(idx);
          }
        } catch {}
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
          thumbnail: normalizedThumbnail,
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
   * Get all courses that a user has started
   * @param {string} userId - User ID
   * @returns {Promise<Object>} List of courses the user has started
   */
  async getUserStartedCourses(userId) {
    try {
      console.log(`[getUserStartedCourses] Looking up courses for userId: ${userId}`);
      
      // Get distinct course IDs from StudentProgress where user has started
      const studentProgress = await prismaQuery(() =>
        prisma.studentProgress.findMany({
          where: { userId },
          select: { courseId: true },
          distinct: ['courseId']
        })
      );

      console.log(`[getUserStartedCourses] Found ${studentProgress?.length || 0} StudentProgress records`);

      if (!studentProgress || studentProgress.length === 0) {
        console.log(`[getUserStartedCourses] No courses found for user ${userId}`);
        return {
          success: true,
          courses: [],
          total: 0,
          message: 'User has not started any courses'
        };
      }

      const courseIds = studentProgress.map(sp => sp.courseId);

      // Get full course details with module count
      const courses = await prismaQuery(() =>
        prisma.course.findMany({
          where: {
            id: { in: courseIds },
            status: 'ACTIVE' // Only return active courses
          },
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
                modules: true
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        })
      );

      // Calculate total lessons per course (count lessons through modules)
      const coursesWithLessonCount = await Promise.all(
        courses.map(async (course) => {
          const lessonCount = await prismaQuery(() =>
            prisma.lesson.count({
              where: {
                module: {
                  courseId: course.id
                }
              }
            })
          );

          return {
            ...course,
            _count: {
              ...course._count,
              lessons: lessonCount
            }
          };
        })
      );

      return {
        success: true,
        courses: coursesWithLessonCount,
        total: coursesWithLessonCount.length
      };

    } catch (error) {
      console.error('Get user started courses error:', error);
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
      // Normalize thumbnail if present in updateData
      let dataToUpdate = { ...updateData };
      if (typeof dataToUpdate.thumbnail === 'string' && dataToUpdate.thumbnail.length > 0) {
        try {
          if (dataToUpdate.thumbnail.startsWith('http://') || dataToUpdate.thumbnail.startsWith('https://')) {
            const u = new URL(dataToUpdate.thumbnail);
            dataToUpdate.thumbnail = u.pathname;
          }
          if (!dataToUpdate.thumbnail.startsWith('/uploads')) {
            const idx = dataToUpdate.thumbnail.indexOf('/uploads');
            if (idx !== -1) dataToUpdate.thumbnail = dataToUpdate.thumbnail.slice(idx);
          }
        } catch {}
      }

      const course = await prisma.course.update({
        where: { id: courseId },
        data: { ...dataToUpdate, updatedAt: new Date() }
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
