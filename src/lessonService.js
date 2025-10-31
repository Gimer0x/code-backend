import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class LessonService {
  /**
   * Create a new lesson
   * @param {Object} lessonData - Lesson data
   * @returns {Promise<Object>} Lesson creation result
   */
  async createLesson(lessonData) {
    try {
      const {
        moduleId,
        type,
        title,
        contentMarkdown,
        youtubeUrl,
        order,
        initialCode,
        solutionCode,
        tests
      } = lessonData;

      if (!moduleId || !type || !title) {
        throw new Error('Module ID, type, and title are required');
      }

      // Get the next order number if not provided
      let lessonOrder = order;
      if (!lessonOrder) {
        const lastLesson = await prisma.lesson.findFirst({
          where: { moduleId },
          orderBy: { order: 'desc' }
        });
        lessonOrder = lastLesson ? lastLesson.order + 1 : 1;
      }

      const lesson = await prisma.lesson.create({
        data: {
          moduleId,
          type: type.toUpperCase(),
          title,
          contentMarkdown,
          youtubeUrl,
          order: lessonOrder,
          initialCode,
          solutionCode,
          tests  // Keep legacy tests field for backward compatibility
        }
      });

      // If tests are provided, also create ChallengeTest entry (preferred storage)
      if (tests && tests.trim().length > 0) {
        try {
          // Extract test contract name to generate filename
          // Example: "contract EventsTest" -> "EventsTest.t.sol"
          const testContractMatch = tests.match(/contract\s+(\w+)/);
          let testFileName = 'ChallengeTest.t.sol'; // Default fallback
          
          if (testContractMatch) {
            const contractName = testContractMatch[1];
            // If contract already ends with "Test", use it directly
            testFileName = contractName.endsWith('Test') 
              ? `${contractName}.t.sol` 
              : `${contractName}Test.t.sol`;
          }
          
          await prisma.challengeTest.create({
            data: {
              lessonId: lesson.id,
              testContent: tests,
              testFileName: testFileName
            }
          });
          
          console.log(`[LESSON] Created ChallengeTest entry: ${testFileName} for lesson: ${lesson.id}`);
        } catch (error) {
          console.error(`[LESSON] Failed to create ChallengeTest entry (non-fatal):`, error.message);
          // Don't fail lesson creation if ChallengeTest creation fails
        }
      }

      return {
        success: true,
        lesson,
        message: `Lesson ${title} created successfully`
      };

    } catch (error) {
      console.error('Lesson creation error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create lesson'
      };
    }
  }

  /**
   * Get lesson by ID with all related data
   * @param {string} lessonId - Lesson ID
   * @returns {Promise<Object>} Lesson data
   */
  async getLesson(lessonId) {
    try {
      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: {
          module: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  language: true
                }
              }
            }
          },
          challengeTests: true,
          quizQuestions: {
            orderBy: { order: 'asc' }
          }
        }
      });

      if (!lesson) {
        throw new Error('Lesson not found');
      }

      return {
        success: true,
        lesson
      };

    } catch (error) {
      console.error('Get lesson error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * List lessons for a module
   * @param {string} moduleId - Module ID
   * @returns {Promise<Object>} Lessons list
   */
  async listLessons(moduleId) {
    try {
      const lessons = await prisma.lesson.findMany({
        where: { moduleId },
        include: {
          challengeTests: true,
          quizQuestions: true,
          _count: {
            select: {
              challengeTests: true,
              quizQuestions: true
            }
          }
        },
        orderBy: { order: 'asc' }
      });

      return {
        success: true,
        lessons
      };

    } catch (error) {
      console.error('List lessons error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Update lesson
   * @param {string} lessonId - Lesson ID
   * @param {Object} updateData - Update data
   * @returns {Promise<Object>} Update result
   */
  async updateLesson(lessonId, updateData) {
    try {
      // Check if tests field is being updated
      const tests = updateData.tests;
      const updateLessonData = { ...updateData };
      
      // Don't update updatedAt if it's already in updateData
      if (!updateLessonData.updatedAt) {
        updateLessonData.updatedAt = new Date();
      }

      const lesson = await prisma.lesson.update({
        where: { id: lessonId },
        data: updateLessonData
      });

      // If tests are provided, also update/create ChallengeTest entry (preferred storage)
      if (tests !== undefined) {
        try {
          // Extract test contract name to generate filename
          let testFileName = 'ChallengeTest.t.sol'; // Default fallback
          
          if (tests && tests.trim().length > 0) {
            const testContractMatch = tests.match(/contract\s+(\w+)/);
            if (testContractMatch) {
              const contractName = testContractMatch[1];
              // If contract already ends with "Test", use it directly
              testFileName = contractName.endsWith('Test') 
                ? `${contractName}.t.sol` 
                : `${contractName}Test.t.sol`;
            }
            
            // Upsert ChallengeTest (create if doesn't exist, update if exists)
            const existingTest = await prisma.challengeTest.findFirst({
              where: { lessonId }
            });
            
            if (existingTest) {
              // Update existing test
              await prisma.challengeTest.update({
                where: { id: existingTest.id },
                data: {
                  testContent: tests,
                  testFileName: testFileName
                }
              });
              console.log(`[LESSON] Updated ChallengeTest entry: ${testFileName} for lesson: ${lessonId}`);
            } else {
              // Create new test
              await prisma.challengeTest.create({
                data: {
                  lessonId: lessonId,
                  testContent: tests,
                  testFileName: testFileName
                }
              });
              console.log(`[LESSON] Created ChallengeTest entry: ${testFileName} for lesson: ${lessonId}`);
            }
          } else {
            // If tests is empty/null, delete ChallengeTest entries for this lesson
            await prisma.challengeTest.deleteMany({
              where: { lessonId }
            });
            console.log(`[LESSON] Deleted ChallengeTest entries for lesson: ${lessonId}`);
          }
        } catch (error) {
          console.error(`[LESSON] Failed to update ChallengeTest entry (non-fatal):`, error.message);
          // Don't fail lesson update if ChallengeTest update fails
        }
      }

      return {
        success: true,
        lesson,
        message: 'Lesson updated successfully'
      };

    } catch (error) {
      console.error('Update lesson error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete lesson
   * @param {string} lessonId - Lesson ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteLesson(lessonId) {
    try {
      await prisma.lesson.delete({
        where: { id: lessonId }
      });

      return {
        success: true,
        message: 'Lesson deleted successfully'
      };

    } catch (error) {
      console.error('Delete lesson error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create challenge test for a lesson
   * @param {Object} testData - Test data
   * @returns {Promise<Object>} Test creation result
   */
  async createChallengeTest(testData) {
    try {
      const {
        lessonId,
        testContent,
        testFileName
      } = testData;

      if (!lessonId || !testContent || !testFileName) {
        throw new Error('Lesson ID, test content, and file name are required');
      }

      const test = await prisma.challengeTest.create({
        data: {
          lessonId,
          testContent,
          testFileName
        }
      });

      return {
        success: true,
        test,
        message: 'Challenge test created successfully'
      };

    } catch (error) {
      console.error('Create challenge test error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create challenge test'
      };
    }
  }

  /**
   * Create quiz question for a lesson
   * @param {Object} questionData - Question data
   * @returns {Promise<Object>} Question creation result
   */
  async createQuizQuestion(questionData) {
    try {
      const {
        lessonId,
        question,
        options,
        correctOption,
        order
      } = questionData;

      if (!lessonId || !question || !options || correctOption === undefined) {
        throw new Error('Lesson ID, question, options, and correct option are required');
      }

      // Get the next order number if not provided
      let questionOrder = order;
      if (!questionOrder) {
        const lastQuestion = await prisma.quizQuestion.findFirst({
          where: { lessonId },
          orderBy: { order: 'desc' }
        });
        questionOrder = lastQuestion ? lastQuestion.order + 1 : 1;
      }

      const quizQuestion = await prisma.quizQuestion.create({
        data: {
          lessonId,
          question,
          options: JSON.stringify(options),
          correctOption,
          order: questionOrder
        }
      });

      return {
        success: true,
        question: {
          ...quizQuestion,
          options: JSON.parse(quizQuestion.options)
        },
        message: 'Quiz question created successfully'
      };

    } catch (error) {
      console.error('Create quiz question error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create quiz question'
      };
    }
  }

  /**
   * Reorder lessons
   * @param {string} moduleId - Module ID
   * @param {Array} lessonOrders - Array of {lessonId, order}
   * @returns {Promise<Object>} Reorder result
   */
  async reorderLessons(moduleId, lessonOrders) {
    try {
      const updates = lessonOrders.map(({ lessonId, order }) =>
        prisma.lesson.update({
          where: { id: lessonId },
          data: { order }
        })
      );

      await Promise.all(updates);

      return {
        success: true,
        message: 'Lessons reordered successfully'
      };

    } catch (error) {
      console.error('Reorder lessons error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
