#!/usr/bin/env node

/**
 * Script to check if challenge tests exist for a lesson
 * Usage: node scripts/check-lesson-tests.js <lessonId>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkLessonTests(lessonId) {
  try {
    console.log(`\n🔍 Checking tests for lesson: ${lessonId}\n`);

    // Check lesson exists
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        challengeTests: {
          select: {
            id: true,
            testFileName: true,
            testContent: true,
            createdAt: true
          }
        },
        module: {
          select: {
            id: true,
            title: true,
            order: true
          }
        }
      }
    });

    if (!lesson) {
      console.error(`❌ Lesson not found: ${lessonId}`);
      process.exit(1);
    }

    console.log(`✅ Lesson found:`);
    console.log(`   Title: ${lesson.title}`);
    console.log(`   Order: ${lesson.order}`);
    console.log(`   Module: ${lesson.module?.title} (Order: ${lesson.module?.order})`);
    console.log(`\n📊 Challenge Tests: ${lesson.challengeTests.length}\n`);

    if (lesson.challengeTests.length === 0) {
      console.log(`⚠️  No challenge tests found for this lesson!`);
      console.log(`\nTo create a test, use:`);
      console.log(`   POST /api/lessons/${lessonId}/challenge-tests`);
      console.log(`   (Requires admin authentication)\n`);
      process.exit(1);
    }

    // List all tests
    lesson.challengeTests.forEach((test, index) => {
      console.log(`Test ${index + 1}:`);
      console.log(`   ID: ${test.id}`);
      console.log(`   File Name: ${test.testFileName}`);
      console.log(`   Content Length: ${test.testContent.length} characters`);
      console.log(`   Created: ${test.createdAt}`);
      console.log(`   Content Preview (first 200 chars):`);
      console.log(`   ${test.testContent.substring(0, 200).replace(/\n/g, ' ')}...`);
      console.log(``);
    });

    console.log(`✅ All tests retrieved successfully!\n`);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Get lessonId from command line
const lessonId = process.argv[2];

if (!lessonId) {
  console.error('Usage: node scripts/check-lesson-tests.js <lessonId>');
  console.error('\nExample:');
  console.error('   node scripts/check-lesson-tests.js cmhezc0nl00119kpm1w9yvxj2');
  process.exit(1);
}

checkLessonTests(lessonId);

