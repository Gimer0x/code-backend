#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const prisma = new PrismaClient();

async function cleanupCoursesAndStudents() {
  try {
    console.log('🧹 Starting cleanup of courses and student data...');
    
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Step 1: Delete all courses (cascading will handle related data)
    console.log('📚 Deleting all courses...');
    const coursesDeleted = await prisma.course.deleteMany({});
    console.log(`✅ Deleted ${coursesDeleted.count} courses (and all related data via cascade)`);

    // Step 2: Delete all student progress data (if any remain)
    console.log('📊 Deleting student progress data...');
    const studentProgressDeleted = await prisma.studentProgress.deleteMany({});
    console.log(`✅ Deleted ${studentProgressDeleted.count} student progress records`);

    // Step 3: Delete all progress records (legacy)
    console.log('📈 Deleting progress records...');
    const progressDeleted = await prisma.progress.deleteMany({});
    console.log(`✅ Deleted ${progressDeleted.count} progress records`);

    // Step 4: Delete all user progress records (legacy)
    console.log('👤 Deleting user progress records...');
    const userProgressDeleted = await prisma.userProgress.deleteMany({});
    console.log(`✅ Deleted ${userProgressDeleted.count} user progress records`);

    // Step 5: Delete all student users (keep only ADMIN users)
    console.log('👥 Deleting student users...');
    const studentUsersDeleted = await prisma.user.deleteMany({
      where: {
        role: 'STUDENT'
      }
    });
    console.log(`✅ Deleted ${studentUsersDeleted.count} student users`);

    // Step 6: Get admin users count
    const adminCount = await prisma.user.count({
      where: {
        role: 'ADMIN'
      }
    });
    console.log(`✅ Preserved ${adminCount} admin user(s)`);

    // Step 7: Clean up filesystem - courses directory
    console.log('📁 Cleaning up courses directory...');
    const coursesDir = process.env.COURSE_WORKSPACE_DIR || path.join(__dirname, '../courses');
    try {
      const entries = await fs.readdir(coursesDir);
      let deletedDirs = 0;
      for (const entry of entries) {
        const entryPath = path.join(coursesDir, entry);
        const stat = await fs.stat(entryPath);
        if (stat.isDirectory()) {
          await fs.rm(entryPath, { recursive: true, force: true });
          deletedDirs++;
        }
      }
      console.log(`✅ Cleaned up ${deletedDirs} course directories from ${coursesDir}`);
    } catch (fsError) {
      if (fsError.code === 'ENOENT') {
        console.log(`⚠️  Courses directory does not exist: ${coursesDir}`);
      } else {
        console.warn(`⚠️  Error cleaning courses directory: ${fsError.message}`);
      }
    }

    // Step 8: Clean up filesystem - foundry-projects directory
    console.log('🔧 Cleaning up foundry-projects directory...');
    const foundryProjectsDir = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, '../foundry-projects');
    try {
      const entries = await fs.readdir(foundryProjectsDir);
      let deletedDirs = 0;
      for (const entry of entries) {
        if (entry.startsWith('course-')) {
          const entryPath = path.join(foundryProjectsDir, entry);
          const stat = await fs.stat(entryPath);
          if (stat.isDirectory()) {
            await fs.rm(entryPath, { recursive: true, force: true });
            deletedDirs++;
          }
        }
      }
      console.log(`✅ Cleaned up ${deletedDirs} foundry project directories from ${foundryProjectsDir}`);
    } catch (fsError) {
      if (fsError.code === 'ENOENT') {
        console.log(`⚠️  Foundry projects directory does not exist: ${foundryProjectsDir}`);
      } else {
        console.warn(`⚠️  Error cleaning foundry projects directory: ${fsError.message}`);
      }
    }

    // Final summary
    console.log('\n📊 Cleanup Summary:');
    console.log(`   - Courses deleted: ${coursesDeleted.count}`);
    console.log(`   - Student progress deleted: ${studentProgressDeleted.count}`);
    console.log(`   - Progress records deleted: ${progressDeleted.count}`);
    console.log(`   - User progress deleted: ${userProgressDeleted.count}`);
    console.log(`   - Student users deleted: ${studentUsersDeleted.count}`);
    console.log(`   - Admin users preserved: ${adminCount}`);
    console.log('\n✅ Cleanup completed successfully!');
    console.log('✅ All course and student data has been removed.');
    console.log('✅ Admin credentials have been preserved.');

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupCoursesAndStudents();

