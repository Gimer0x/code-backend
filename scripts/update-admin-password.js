import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function updateAdminPassword() {
  try {
    console.log('🔧 Updating admin user password...');

    // Find the admin user
    const admin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    if (!admin) {
      console.log('❌ No admin user found');
      return;
    }

    console.log(`📧 Found admin user: ${admin.email}`);

    // Hash the new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash('admin123', saltRounds);

    // Update the admin user with password
    const updatedAdmin = await prisma.user.update({
      where: { id: admin.id },
      data: { password: hashedPassword },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isPremium: true,
        createdAt: true
      }
    });

    console.log('✅ Admin user password updated successfully:');
    console.log(`   Email: ${updatedAdmin.email}`);
    console.log(`   Name: ${updatedAdmin.name}`);
    console.log(`   Role: ${updatedAdmin.role}`);
    console.log(`   ID: ${updatedAdmin.id}`);

  } catch (error) {
    console.error('❌ Error updating admin password:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updateAdminPassword();
