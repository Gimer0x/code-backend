import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding language support...')

  // Create languages
  const solidity = await prisma.language.upsert({
    where: { name: 'solidity' },
    update: {},
    create: {
      name: 'solidity',
      displayName: 'Solidity',
      compilerApp: 'blockchain-compiler',
      isActive: true,
      icon: '/icons/solidity.svg',
      color: '#363636'
    }
  })

  const rust = await prisma.language.upsert({
    where: { name: 'rust' },
    update: {},
    create: {
      name: 'rust',
      displayName: 'Rust',
      compilerApp: 'backend-compiler',
      isActive: false,
      icon: '/icons/rust.svg',
      color: '#DEA584'
    }
  })

  const go = await prisma.language.upsert({
    where: { name: 'go' },
    update: {},
    create: {
      name: 'go',
      displayName: 'Go',
      compilerApp: 'backend-compiler',
      isActive: false,
      icon: '/icons/go.svg',
      color: '#00ADD8'
    }
  })

  console.log('✅ Languages created:', { solidity: solidity.id, rust: rust.id, go: go.id })

  // Create language configurations
  const solidityConfig = await prisma.languageConfiguration.upsert({
    where: {
      languageId_compiler: {
        languageId: solidity.id,
        compiler: 'forge'
      }
    },
    update: {},
    create: {
      languageId: solidity.id,
      compiler: 'forge',
      version: '0.8.30',
      buildCommand: 'forge build --json',
      testCommand: 'forge test --json',
      lintCommand: 'forge fmt'
    }
  })

  const rustConfig = await prisma.languageConfiguration.upsert({
    where: {
      languageId_compiler: {
        languageId: rust.id,
        compiler: 'cargo'
      }
    },
    update: {},
    create: {
      languageId: rust.id,
      compiler: 'cargo',
      version: '1.70.0',
      buildCommand: 'cargo build',
      testCommand: 'cargo test',
      lintCommand: 'cargo fmt'
    }
  })

  const goConfig = await prisma.languageConfiguration.upsert({
    where: {
      languageId_compiler: {
        languageId: go.id,
        compiler: 'go'
      }
    },
    update: {},
    create: {
      languageId: go.id,
      compiler: 'go',
      version: '1.21.0',
      buildCommand: 'go build',
      testCommand: 'go test',
      lintCommand: 'go fmt'
    }
  })

  console.log('✅ Language configurations created:', { 
    solidity: solidityConfig.id, 
    rust: rustConfig.id, 
    go: goConfig.id 
  })

  console.log('🎉 Language support seeding completed!')

  // Create course project management data
  console.log('🌱 Seeding course project management...')

  // Get the first course to create a project for
  const firstCourse = await prisma.course.findFirst()
  
  if (firstCourse) {
    // Create course project
    const courseProject = await prisma.courseProject.upsert({
      where: { courseId: firstCourse.id },
      update: {},
      create: {
        courseId: firstCourse.id,
        projectPath: `/app/course-projects/${firstCourse.id}`,
        foundryConfig: {
          profile: {
            default: {
              src: "src",
              out: "out",
              libs: ["lib"],
              solc: "0.8.30",
              optimizer: true,
              optimizer_runs: 200
            }
          }
        },
        remappings: {
          "forge-std/": "lib/forge-std/src/",
          "@openzeppelin/": "lib/openzeppelin-contracts/"
        }
      }
    })

    console.log('✅ Course project created:', courseProject.id)

    // Create dependencies
    const forgeStd = await prisma.courseDependency.upsert({
      where: {
        courseProjectId_name: {
          courseProjectId: courseProject.id,
          name: 'forge-std'
        }
      },
      update: {},
      create: {
        courseProjectId: courseProject.id,
        name: 'forge-std',
        source: 'foundry-rs/forge-std',
        isInstalled: true
      }
    })

    const openzeppelin = await prisma.courseDependency.upsert({
      where: {
        courseProjectId_name: {
          courseProjectId: courseProject.id,
          name: 'openzeppelin-contracts'
        }
      },
      update: {},
      create: {
        courseProjectId: courseProject.id,
        name: 'openzeppelin-contracts',
        source: 'OpenZeppelin/openzeppelin-contracts',
        isInstalled: true
      }
    })

    console.log('✅ Dependencies created:', { forgeStd: forgeStd.id, openzeppelin: openzeppelin.id })

    // Create templates
    const basicTemplate = await prisma.courseTemplate.create({
      data: {
        courseProjectId: courseProject.id,
        name: 'basic',
        description: 'Basic Solidity template',
        templatePath: '/app/templates/solidity-basic',
        isDefault: true
      }
    })

    const advancedTemplate = await prisma.courseTemplate.create({
      data: {
        courseProjectId: courseProject.id,
        name: 'advanced',
        description: 'Advanced Solidity template with OpenZeppelin',
        templatePath: '/app/templates/solidity-advanced',
        isDefault: false
      }
    })

    console.log('✅ Templates created:', { basic: basicTemplate.id, advanced: advancedTemplate.id })
  }

  console.log('🎉 Course project management seeding completed!')

  // Create student progress management data
  console.log('🌱 Seeding student progress management...')

  // Get a user and lesson to create progress for
  const user = await prisma.user.findFirst()
  const lesson = await prisma.lesson.findFirst({
    include: {
      module: true
    }
  })

  if (user && lesson && lesson.module) {
    // Create student progress
    const studentProgress = await prisma.studentProgress.upsert({
      where: {
        userId_courseId_lessonId: {
          userId: user.id,
          courseId: lesson.module.courseId,
          lessonId: lesson.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        courseId: lesson.module.courseId,
        lessonId: lesson.id,
        codeContent: `// Student's Solidity code
pragma solidity ^0.8.30;

contract MyContract {
    string public message;
    
    constructor(string memory _message) {
        message = _message;
    }
    
    function setMessage(string memory _message) public {
        message = _message;
    }
}`
      }
    })

    console.log('✅ Student progress created:', studentProgress.id)

    // Create compilation result
    const compilationResult = await prisma.compilationResult.create({
      data: {
        studentProgressId: studentProgress.id,
        success: true,
        output: {
          abi: [
            {
              "inputs": [{"name": "_message", "type": "string"}],
              "name": "constructor",
              "type": "constructor"
            },
            {
              "inputs": [],
              "name": "message",
              "outputs": [{"name": "", "type": "string"}],
              "stateMutability": "view",
              "type": "function"
            }
          ],
          bytecode: "0x608060405234801561001057600080fd5b50...",
          contractName: "MyContract"
        },
        compilationTime: 1250
      }
    })

    console.log('✅ Compilation result created:', compilationResult.id)

    // Create test result
    const testResult = await prisma.testResult.create({
      data: {
        studentProgressId: studentProgress.id,
        success: true,
        output: {
          testResults: [
            {
              name: "testConstructor",
              status: "PASS",
              gasUsed: 123456
            },
            {
              name: "testSetMessage",
              status: "PASS",
              gasUsed: 98765
            }
          ]
        },
        testCount: 2,
        passedCount: 2,
        failedCount: 0,
        testTime: 850
      }
    })

    console.log('✅ Test result created:', testResult.id)

    // Create student files
    const contractFile = await prisma.studentFile.upsert({
      where: {
        studentProgressId_fileName: {
          studentProgressId: studentProgress.id,
          fileName: 'MyContract.sol'
        }
      },
      update: {},
      create: {
        studentProgressId: studentProgress.id,
        fileName: 'MyContract.sol',
        filePath: 'src/MyContract.sol',
        content: studentProgress.codeContent,
        fileType: 'contract',
        isMain: true
      }
    })

    const testFile = await prisma.studentFile.upsert({
      where: {
        studentProgressId_fileName: {
          studentProgressId: studentProgress.id,
          fileName: 'MyContract.t.sol'
        }
      },
      update: {},
      create: {
        studentProgressId: studentProgress.id,
        fileName: 'MyContract.t.sol',
        filePath: 'test/MyContract.t.sol',
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/MyContract.sol";

contract MyContractTest is Test {
    MyContract public myContract;
    
    function setUp() public {
        myContract = new MyContract("Hello World");
    }
    
    function testConstructor() public {
        assertEq(myContract.message(), "Hello World");
    }
    
    function testSetMessage() public {
        myContract.setMessage("New Message");
        assertEq(myContract.message(), "New Message");
    }
}`,
        fileType: 'test',
        isMain: false
      }
    })

    console.log('✅ Student files created:', { contract: contractFile.id, test: testFile.id })
  }

  console.log('🎉 Student progress management seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })