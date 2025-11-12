import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function deleteUser() {
  try {
    const userId = process.argv[2];
    const email = process.argv[3];

    if (!userId && !email) {
      console.error('❌ Error: Please provide either a user ID or email address');
      console.log('\nUsage:');
      console.log('  node scripts/delete-user.js <userId>');
      console.log('  node scripts/delete-user.js <email>');
      process.exit(1);
    }

    // Find user by ID or email
    let user;
    if (userId) {
      user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          _count: {
            select: {
              progress: true,
              userProgress: true,
              studentProgress: true,
              courses: true,
              sessions: true,
              accounts: true
            }
          }
        }
      });
    } else {
      user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
        include: {
          _count: {
            select: {
              progress: true,
              userProgress: true,
              studentProgress: true,
              courses: true,
              sessions: true,
              accounts: true
            }
          }
        }
      });
    }

    if (!user) {
      console.error(`❌ User not found: ${userId || email}`);
      process.exit(1);
    }

    console.log('🔍 User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Created: ${user.createdAt}`);
    console.log('\n📊 Related data counts:');
    console.log(`   Progress records: ${user._count.progress}`);
    console.log(`   User progress records: ${user._count.userProgress}`);
    console.log(`   Student progress records: ${user._count.studentProgress}`);
    console.log(`   Courses created: ${user._count.courses}`);
    console.log(`   Sessions: ${user._count.sessions}`);
    console.log(`   Accounts: ${user._count.accounts}`);

    // Check if user has created courses (should not delete if they're a course creator)
    if (user._count.courses > 0) {
      console.error('\n⚠️  WARNING: This user has created courses!');
      console.error('   Deleting this user will cascade delete their courses.');
      console.error('   This is a destructive operation. Aborting for safety.');
      process.exit(1);
    }

    // Delete user (cascading deletes will handle related data)
    console.log('\n🗑️  Deleting user and all related data...');
    await prisma.user.delete({
      where: { id: user.id }
    });

    console.log('✅ User deleted successfully!');
    console.log(`   Email: ${user.email}`);
    console.log(`   ID: ${user.id}`);

  } catch (error) {
    console.error('❌ Error deleting user:', error);
    
    if (error.code === 'P2003') {
      console.error('   Foreign key constraint violation. Some related data could not be deleted.');
    } else if (error.code === 'P2025') {
      console.error('   User not found in database.');
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deleteUser();

