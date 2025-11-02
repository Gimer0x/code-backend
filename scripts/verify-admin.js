import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function verifyAdminUser() {
  try {
    const email = process.env.VERIFY_EMAIL || process.env.ADMIN_EMAIL || 'gimer@dappdojo.com';
    const password = process.env.VERIFY_PASSWORD || process.env.ADMIN_PASSWORD || 'Ottawa!1978';

    console.log('🔍 Verifying admin user...');
    console.log(`   Looking for: ${email}`);
    console.log('');

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      console.log('❌ User not found!');
      console.log('');
      console.log('   Email:', email);
      console.log('');
      console.log('💡 This user may not have been created yet.');
      console.log('   Run: npm run create-admin');
      console.log('   Or via Fly.io: flyctl ssh console --app code-backend -C "npm run create-admin"');
      return;
    }

    // Display user details
    console.log('✅ User found!');
    console.log('');
    console.log('📋 User Details:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Premium: ${user.isPremium ? 'Yes' : 'No'}`);
    console.log(`   Created: ${user.createdAt}`);
    console.log(`   Updated: ${user.updatedAt}`);
    console.log('');

    // Check if password is correct
    if (user.password) {
      const passwordMatch = await bcrypt.compare(password, user.password);
      
      if (passwordMatch) {
        console.log('✅ Password verification: CORRECT');
        console.log('');
        console.log('🎉 Admin user is properly configured!');
      } else {
        console.log('⚠️  Password verification: INCORRECT');
        console.log('');
        console.log('   The password does not match.');
        console.log('   Expected password:', password);
        console.log('');
        console.log('💡 To update the password:');
        console.log('   npm run update-admin-password');
        console.log('   Or via Fly.io: flyctl ssh console --app code-backend -C "npm run update-admin-password"');
      }
    } else {
      console.log('⚠️  No password set for this user');
    }

    console.log('');

    // Also check for all admin users
    const allAdmins = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isPremium: true,
        createdAt: true
      }
    });

    if (allAdmins.length > 0) {
      console.log('📊 All Admin Users:');
      allAdmins.forEach((admin, index) => {
        console.log(`   ${index + 1}. ${admin.email} (${admin.name})`);
        console.log(`      ID: ${admin.id}, Created: ${admin.createdAt}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error verifying admin user:', error);
    console.error('');
    console.error('💡 Make sure:');
    console.error('   1. DATABASE_URL is set correctly');
    console.error('   2. Database is accessible');
    console.error('   3. Prisma migrations have been run');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
verifyAdminUser();

