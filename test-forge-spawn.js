import { spawn } from 'child_process';
import { promises as fs } from 'fs';

// Test forge spawn
async function testForgeSpawn() {
  const tempDir = '/Users/gimer/Desktop/Projects/Courses/dappdojo/backend/foundry-projects/course-solidity-basics-101';
  
  // Write test code
  const testCode = `// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

contract Events {
    uint256 public count;
    
    event Increment(address indexed who, uint256 newCount);
    event Decrement(address indexed who, uint256 newCount);
    
    function get(address _user) external view returns (uint256) {
        return count;
    }
    
    function inc() external {
        count += 1;
        emit Increment(msg.sender, count);
    }
    
    function dec() external {
        count -= 1;
        emit Decrement(msg.sender, count);
    }
}`;
  
  await fs.writeFile(`${tempDir}/src/Events.sol`, testCode, 'utf8');
  
  // Run forge
  const result = await new Promise((resolve, reject) => {
    const process = spawn('forge', ['build', '--force'], {
      cwd: tempDir,
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    process.on('close', (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        stdout,
        stderr
      });
    });

    process.on('error', (error) => {
      reject(error);
    });
  });
  
  console.log('Forge spawn result:');
  console.log('Success:', result.success);
  console.log('Exit code:', result.exitCode);
  console.log('STDOUT length:', result.stdout.length);
  console.log('STDERR length:', result.stderr.length);
  console.log('STDOUT:');
  console.log(result.stdout);
  console.log('STDERR:');
  console.log(result.stderr);
}

testForgeSpawn().catch(console.error);
