import { PrismaClient } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Get the base path for Foundry projects
const basePath = process.env.FOUNDRY_CACHE_DIR || path.join(__dirname, 'foundry-projects');

async function testCourseCreation() {
  const courseId = 'test-course-' + Date.now();
  const coursePath = path.join(basePath, `course-${courseId}`);
  
  console.log('🧪 Testing Course Creation');
  console.log('============================');
  console.log(`Course ID: ${courseId}`);
  console.log(`Course Path: ${coursePath}`);
  console.log(`Base Path: ${basePath}`);
  console.log('');
  
  try {
    // Step 1: Create directory
    console.log('📋 Step 1: Creating course directory...');
    await fs.mkdir(coursePath, { recursive: true });
    console.log('✅ Directory created');
    console.log('');
    
    // Step 2: Initialize git
    console.log('📋 Step 2: Initializing git repository...');
    await new Promise((resolve, reject) => {
      const git = spawn('git', ['init'], {
        cwd: coursePath,
        stdio: 'pipe'
      });
      
      git.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Git initialized');
          resolve();
        } else {
          console.log('⚠️  Git init warning (non-critical)');
          resolve(); // Continue anyway
        }
      });
      
      git.on('error', (error) => {
        console.log('⚠️  Git error (non-critical):', error.message);
        resolve(); // Continue anyway
      });
    });
    console.log('');
    
    // Step 3: Initialize Foundry project
    console.log('📋 Step 3: Initializing Foundry project...');
    const initResult = await new Promise((resolve, reject) => {
      const forge = spawn('forge', ['init', '--force', '.'], {
        cwd: coursePath,
        stdio: 'pipe'
      });
      
      let stdout = '';
      let stderr = '';
      
      forge.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      forge.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      forge.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
      
      forge.on('error', (error) => {
        reject(error);
      });
    });
    
    if (initResult.code === 0) {
      console.log('✅ Foundry project initialized');
    } else {
      console.log('❌ Foundry init failed');
      console.log('stdout:', initResult.stdout);
      console.log('stderr:', initResult.stderr);
      return;
    }
    console.log('');
    
    // Step 4: Install forge-std
    console.log('📋 Step 4: Installing forge-std...');
    const forgeStdResult = await new Promise((resolve, reject) => {
      const forge = spawn('forge', ['install', 'foundry-rs/forge-std'], {
        cwd: coursePath,
        stdio: 'pipe'
      });
      
      let stdout = '';
      let stderr = '';
      
      forge.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      forge.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      forge.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
      
      forge.on('error', (error) => {
        reject(error);
      });
    });
    
    if (forgeStdResult.code === 0) {
      console.log('✅ forge-std installed');
    } else {
      console.log('❌ forge-std installation failed');
      console.log('stderr:', forgeStdResult.stderr);
    }
    console.log('');
    
    // Step 5: Install openzeppelin-contracts
    console.log('📋 Step 5: Installing openzeppelin-contracts...');
    const openzeppelinResult = await new Promise((resolve, reject) => {
      const forge = spawn('forge', ['install', 'OpenZeppelin/openzeppelin-contracts'], {
        cwd: coursePath,
        stdio: 'pipe'
      });
      
      let stdout = '';
      let stderr = '';
      
      forge.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      forge.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      forge.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });
      
      forge.on('error', (error) => {
        reject(error);
      });
    });
    
    if (openzeppelinResult.code === 0) {
      console.log('✅ openzeppelin-contracts installed');
    } else {
      console.log('❌ openzeppelin-contracts installation failed');
      console.log('stderr:', openzeppelinResult.stderr);
    }
    console.log('');
    
    // Step 6: Verify lib folder structure
    console.log('📋 Step 6: Verifying lib folder structure...');
    const libPath = path.join(coursePath, 'lib');
    
    try {
      const libExists = await fs.access(libPath).then(() => true).catch(() => false);
      if (!libExists) {
        console.log('❌ lib folder does not exist');
        return;
      }
      
      console.log('✅ lib folder exists');
      console.log('');
      
      // Check for forge-std
      const forgeStdPath = path.join(libPath, 'forge-std');
      const forgeStdExists = await fs.access(forgeStdPath).then(() => true).catch(() => false);
      console.log(`   forge-std: ${forgeStdExists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
      
      if (forgeStdExists) {
        const forgeStdContents = await fs.readdir(forgeStdPath);
        console.log(`      Contents: ${forgeStdContents.join(', ')}`);
      }
      
      // Check for openzeppelin-contracts
      const openzeppelinPath = path.join(libPath, 'openzeppelin-contracts');
      const openzeppelinExists = await fs.access(openzeppelinPath).then(() => true).catch(() => false);
      console.log(`   openzeppelin-contracts: ${openzeppelinExists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
      
      if (openzeppelinExists) {
        const openzeppelinContents = await fs.readdir(openzeppelinPath);
        console.log(`      Contents: ${openzeppelinContents.slice(0, 5).join(', ')}... (${openzeppelinContents.length} items)`);
      }
      
      console.log('');
      console.log('📋 All lib contents:');
      const allLibContents = await fs.readdir(libPath);
      allLibContents.forEach(item => {
        console.log(`   - ${item}`);
      });
      
    } catch (error) {
      console.log('❌ Error checking lib folder:', error.message);
    }
    
    console.log('');
    console.log('✅ Test complete!');
    console.log(`📁 Course directory: ${coursePath}`);
    console.log(`   You can inspect it with: ls -la ${coursePath}/lib`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testCourseCreation();

