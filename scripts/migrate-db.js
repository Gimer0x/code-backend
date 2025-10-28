#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

async function migrateDatabase() {
  try {
    console.log('🔄 Starting database migration...');
    
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    console.log('📊 Generating Prisma client...');
    await execAsync('npx prisma generate');
    
    console.log('🗄️ Pushing schema to database...');
    await execAsync('npx prisma db push');
    
    console.log('🌱 Seeding database...');
    await execAsync('npx prisma db seed');
    
    console.log('✅ Database migration completed successfully!');
    
    // Test connection
    await prisma.$connect();
    console.log('🔗 Database connection test successful');
    
    // Get some stats
    const userCount = await prisma.user.count();
    const courseCount = await prisma.course.count();
    console.log(`📈 Database stats: ${userCount} users, ${courseCount} courses`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

migrateDatabase();
