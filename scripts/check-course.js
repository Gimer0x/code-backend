import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function checkCourse(courseId) {
  try {
    console.log(`🔍 Checking course: ${courseId}`);
    console.log('');

    // 1. Check if course exists in database
    console.log('📋 Step 1: Checking database...');
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        courseProject: {
          include: {
            dependencies: true,
            templates: true
          }
        }
      }
    });

    if (!course) {
      console.log('❌ Course not found in database!');
      console.log('');
      console.log('💡 The course needs to be created in the database first.');
      return;
    }

    console.log('✅ Course found in database:');
    console.log(`   Title: ${course.title}`);
    console.log(`   ID: ${course.id}`);
    console.log(`   Status: ${course.status}`);
    console.log(`   Created: ${course.createdAt}`);
    console.log('');

    // 2. Check if course project exists in database
    if (course.courseProject) {
      console.log('📋 Step 2: Checking course project in database...');
      console.log(`   Project Path: ${course.courseProject.projectPath}`);
      console.log(`   Active: ${course.courseProject.isActive}`);
      console.log('');
    } else {
      console.log('⚠️  No CourseProject record found in database');
      console.log('');
    }

    // 3. Check if file system project exists
    console.log('📋 Step 3: Checking file system...');
    const basePath = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, '../foundry-projects');
    const courseProjectPath = path.join(basePath, `course-${courseId}`);
    
    console.log(`   Expected path: ${courseProjectPath}`);
    console.log(`   Base path: ${basePath}`);
    
    try {
      await fs.access(courseProjectPath);
      console.log('✅ Course project directory EXISTS');
      console.log('');

      // Check for required files
      const foundryToml = path.join(courseProjectPath, 'foundry.toml');
      const remappingsTxt = path.join(courseProjectPath, 'remappings.txt');
      const srcDir = path.join(courseProjectPath, 'src');
      const libDir = path.join(courseProjectPath, 'lib');

      const checks = {
        'foundry.toml': await fs.access(foundryToml).then(() => true).catch(() => false),
        'remappings.txt': await fs.access(remappingsTxt).then(() => true).catch(() => false),
        'src/': await fs.access(srcDir).then(() => true).catch(() => false),
        'lib/': await fs.access(libDir).then(() => true).catch(() => false)
      };

      console.log('📋 File structure:');
      Object.entries(checks).forEach(([name, exists]) => {
        console.log(`   ${exists ? '✅' : '❌'} ${name}`);
      });
      console.log('');

    } catch (error) {
      console.log('❌ Course project directory NOT FOUND');
      console.log('');
      console.log('💡 The course exists in the database but the file system project is missing.');
      console.log('');
      console.log('🔧 To fix this, you can:');
      console.log('   1. Create the directory manually');
      console.log('   2. Initialize a Foundry project in that directory');
      console.log('   3. Or let the system auto-create it on first use');
      console.log('');
      console.log(`   Path: ${courseProjectPath}`);
    }

    // Summary
    console.log('📊 Summary:');
    console.log(`   Database: ${course ? '✅' : '❌'}`);
    console.log(`   CourseProject record: ${course.courseProject ? '✅' : '❌'}`);
    console.log(`   File system: ${await fs.access(courseProjectPath).then(() => true).catch(() => false) ? '✅' : '❌'}`);

  } catch (error) {
    console.error('❌ Error checking course:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get courseId from command line or use default
const courseId = process.argv[2] || 'solidity-101';

checkCourse(courseId);

