import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function checkDuplicateEmails() {
  try {
    console.log('🔍 Checking for duplicate or similar email addresses...\n');

    // Get all users
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        password: true
      },
      orderBy: {
        email: 'asc'
      }
    });

    console.log(`📊 Total users in database: ${users.length}\n`);

    // Group emails by lowercase version
    const emailMap = new Map();
    
    for (const user of users) {
      const lowerEmail = user.email.toLowerCase();
      
      if (!emailMap.has(lowerEmail)) {
        emailMap.set(lowerEmail, []);
      }
      
      emailMap.get(lowerEmail).push(user);
    }

    // Find duplicates (same email, different casing)
    let duplicateCount = 0;
    const duplicates = [];

    for (const [lowerEmail, userList] of emailMap.entries()) {
      if (userList.length > 1) {
        duplicateCount++;
        duplicates.push({
          normalizedEmail: lowerEmail,
          users: userList
        });
      }
    }

    if (duplicateCount > 0) {
      console.log(`⚠️  Found ${duplicateCount} email(s) with duplicate entries (different casing):\n`);
      
      for (const dup of duplicates) {
        console.log(`📧 Email: ${dup.normalizedEmail}`);
        console.log(`   Found ${dup.users.length} user(s) with this email:\n`);
        
        for (const user of dup.users) {
          console.log(`   - ID: ${user.id}`);
          console.log(`     Email (as stored): ${user.email}`);
          console.log(`     Name: ${user.name || 'N/A'}`);
          console.log(`     Role: ${user.role}`);
          console.log(`     Has Password: ${user.password ? 'Yes' : 'No'}`);
          console.log(`     Created: ${user.createdAt}`);
          console.log('');
        }
        console.log('---\n');
      }
    } else {
      console.log('✅ No duplicate emails found (all emails are unique when lowercased)\n');
    }

    // Check for specific email from the image
    const searchEmail = 'gimer.cervera@settlenetwork.com';
    const lowerSearchEmail = searchEmail.toLowerCase();
    
    console.log(`\n🔎 Searching for users with email containing: "${searchEmail}"\n`);
    
    const matchingUsers = users.filter(u => 
      u.email.toLowerCase().includes(lowerSearchEmail) ||
      lowerSearchEmail.includes(u.email.toLowerCase())
    );

    if (matchingUsers.length > 0) {
      console.log(`Found ${matchingUsers.length} user(s):\n`);
      for (const user of matchingUsers) {
        console.log(`   - ID: ${user.id}`);
        console.log(`     Email: ${user.email}`);
        console.log(`     Name: ${user.name || 'N/A'}`);
        console.log(`     Role: ${user.role}`);
        console.log(`     Has Password: ${user.password ? 'Yes' : 'No'}`);
        console.log(`     Created: ${user.createdAt}`);
        console.log('');
      }
    } else {
      console.log(`   No users found with email containing "${searchEmail}"\n`);
    }

    // Show all emails for manual inspection
    console.log('\n📋 All user emails in database:\n');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (ID: ${user.id})`);
    });

  } catch (error) {
    console.error('❌ Error checking emails:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicateEmails();

