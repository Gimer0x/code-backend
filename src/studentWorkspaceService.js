import { PrismaClient } from '@prisma/client';
import path from 'path';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';

const prisma = new PrismaClient();

function getCourseRoot() {
  const dir = process.env.COURSE_WORKSPACE_DIR || path.join(process.cwd(), 'courses');
  return dir;
}

function getStudentDir(courseId, studentId) {
  return path.join(getCourseRoot(), courseId, 'students', studentId);
}

function getSharedLibDir(courseId) {
  return path.join(getCourseRoot(), courseId, 'lib');
}

function getTemplatesDir(courseId) {
  return path.join(getCourseRoot(), courseId, 'templates');
}

function getTestsDir(courseId) {
  return path.join(getCourseRoot(), courseId, 'tests');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function pathExists(p) {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function copyDir(src, dest) {
  await ensureDir(dest);
  if (fs.cp) {
    await fs.cp(src, dest, { recursive: true });
  } else {
    // Fallback shallow copy
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(s, d);
      } else if (entry.isFile()) {
        await fs.copyFile(s, d);
      }
    }
  }
}

async function ensureSharedLib(courseId) {
  const libDir = getSharedLibDir(courseId);
  if (await pathExists(libDir)) return;
  await ensureDir(libDir);

  // Preferred source: the Foundry project created for this course
  const foundryRoot = process.env.FOUNDRY_CACHE_DIR || path.join(process.cwd(), 'foundry-projects');
  const courseFoundryLib = path.join(foundryRoot, `course-${courseId}`, 'lib');

  // Fallback source: ops-provided template directory
  const envSource = process.env.COURSE_LIB_SOURCE_DIR;

  const candidateSources = [courseFoundryLib, envSource].filter(Boolean);
  const candidates = ['forge-std', 'openzeppelin-contracts'];

  for (const source of candidateSources) {
    try {
      for (const name of candidates) {
        const srcPath = path.join(source, name);
        if (await pathExists(srcPath)) {
          const destPath = path.join(libDir, name);
          await copyDir(srcPath, destPath);
        }
      }
      // If we copied at least one library, we're good
      if ((await pathExists(path.join(libDir, 'forge-std'))) || (await pathExists(path.join(libDir, 'openzeppelin-contracts')))) {
        return;
      }
    } catch {}
  }

  // If nothing was copied, surface a clear error
  throw new Error('Shared lib bootstrap failed: no source found for forge-std/openzeppelin-contracts');
}

async function writeFoundryToml(studentDir, solc = '0.8.30') {
  const toml = [
    '[profile.default]',
    'src = "src"',
    'out = "out"',
    'libs = ["../lib"]',
    `solc = "${solc}"`,
    'optimizer = true',
    'optimizer_runs = 200',
  ].join('\n');
  await fs.writeFile(path.join(studentDir, 'foundry.toml'), toml);
}

async function copyTemplate(courseId, exerciseId, studentDir) {
  const srcDir = path.join(studentDir, 'src');
  await ensureDir(srcDir);
  const templateDir = path.join(getTemplatesDir(courseId), exerciseId);
  try {
    const entries = await fs.readdir(templateDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.sol')) {
        const content = await fs.readFile(path.join(templateDir, entry.name));
        await fs.writeFile(path.join(srcDir, entry.name), content);
      }
    }
  } catch (e) {
    // ignore if no template
  }
}

function guardStudentPath(studentDir, filePath) {
  const resolved = path.resolve(studentDir, filePath);
  if (!resolved.startsWith(studentDir)) {
    throw new Error('Invalid file path');
  }
  return resolved;
}

async function runForge(cwd, args, timeoutMs = 30000) {
  return await new Promise((resolve, reject) => {
    const child = spawn('forge', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('TIMEOUT'));
    }, timeoutMs);
    child.stdout.on('data', d => (stdout += d.toString()))
    child.stderr.on('data', d => (stderr += d.toString()))
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export class StudentWorkspaceService {
  static async initWorkspace(userId, { courseId, exerciseId, mode = 'ensure', useTemplate = true, solc }) {
    const studentDir = getStudentDir(courseId, userId);
    // Ensure shared lib exists (read-only bootstrap if configured)
    await ensureSharedLib(courseId);
    await ensureDir(studentDir);
    await ensureDir(path.join(studentDir, 'src'));
    await ensureDir(path.join(studentDir, 'test'));
    await writeFoundryToml(studentDir, solc);
    if (mode === 'reset') {
      // wipe src/test
      const srcDir = path.join(studentDir, 'src');
      const testDir = path.join(studentDir, 'test');
      try {
        const srcFiles = await fs.readdir(srcDir);
        await Promise.all(srcFiles.map(f => fs.unlink(path.join(srcDir, f))));
      } catch {}
      try {
        const testFiles = await fs.readdir(testDir);
        await Promise.all(testFiles.map(f => fs.unlink(path.join(testDir, f))));
      } catch {}
    }
    if (useTemplate && exerciseId) {
      await copyTemplate(courseId, exerciseId, studentDir);
    }
    const files = await fs.readdir(path.join(studentDir, 'src')).catch(() => []);
    return { success: true, workspacePath: studentDir, files };
  }

  static async saveCode(userId, { courseId, lessonId, files }) {
    // Persist StudentProgress and StudentFile rows
    const results = [];
    for (const f of files || []) {
      const existing = await prisma.studentProgress.upsert({
        where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
        create: { userId, courseId, lessonId, codeContent: f.content, lastSavedAt: new Date() },
        update: { codeContent: f.content, lastSavedAt: new Date() }
      });
      await prisma.studentFile.upsert({
        where: { studentProgressId_fileName: { studentProgressId: existing.id, fileName: path.basename(f.path) } },
        create: { studentProgressId: existing.id, fileName: path.basename(f.path), filePath: f.path, content: f.content, fileType: 'contract' },
        update: { content: f.content, filePath: f.path }
      });
      results.push(existing.id);
    }
    return { success: true };
  }

  static async upsertFilesOnDisk(userId, { courseId, files }) {
    const studentDir = getStudentDir(courseId, userId);
    await ensureDir(studentDir);
    for (const f of files || []) {
      const target = guardStudentPath(studentDir, f.path);
      await ensureDir(path.dirname(target));
      await fs.writeFile(target, f.content ?? '');
    }
    return { success: true };
  }

  static async compileFile(userId, { courseId, lessonId, filePath, files, solc }) {
    // Save to DB first
    if (files && files.length > 0) {
      await this.saveCode(userId, { courseId, lessonId, files });
    }
    // Write to disk
    await this.upsertFilesOnDisk(userId, { courseId, files });
    const studentDir = getStudentDir(courseId, userId);
    await writeFoundryToml(studentDir, solc);
    // Compile only the specified file
    const rel = filePath.startsWith('src/') ? filePath : `src/${filePath}`;
    const res = await runForge(studentDir, ['build', '--json', '--contracts', rel]);
    // Persist compilation result
    const sp = await prisma.studentProgress.upsert({
      where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
      create: { userId, courseId, lessonId },
      update: {}
    });
    await prisma.compilationResult.create({
      data: { studentProgressId: sp.id, success: res.code === 0, output: res.stdout ? JSON.parseSafe(res.stdout) ?? res.stdout : null, errors: res.stderr || null }
    });
    return { success: res.code === 0, result: { stdout: res.stdout, stderr: res.stderr } };
  }

  static async testFile(userId, { courseId, lessonId, files, testFileFromDB }) {
    // Save to DB and disk
    if (files && files.length > 0) {
      await this.saveCode(userId, { courseId, lessonId, files });
    }
    await this.upsertFilesOnDisk(userId, { courseId, files });
    const studentDir = getStudentDir(courseId, userId);
    await ensureDir(path.join(studentDir, 'test'));
    // Materialize evaluator test file
    const { testFileName, testContent } = testFileFromDB;
    const targetTest = path.join(studentDir, 'test', testFileName);
    await fs.writeFile(targetTest, testContent);
    // Run tests limited to this file
    const res = await runForge(studentDir, ['test', '--json', '--match-path', `test/${testFileName}`]);
    // Persist test result
    const sp = await prisma.studentProgress.upsert({
      where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
      create: { userId, courseId, lessonId },
      update: {}
    });
    await prisma.testResult.create({
      data: { studentProgressId: sp.id, success: res.code === 0, output: res.stdout ? JSON.parseSafe(res.stdout) ?? res.stdout : null, errors: res.stderr || null }
    });
    return { success: res.code === 0, result: { stdout: res.stdout, stderr: res.stderr } };
  }

  static async getProgress(userId, { courseId, lessonId }) {
    const sp = await prisma.studentProgress.findUnique({
      where: { userId_courseId_lessonId: { userId, courseId, lessonId } },
      include: { compilationResults: { orderBy: { createdAt: 'desc' }, take: 1 }, testResults: { orderBy: { createdAt: 'desc' }, take: 1 }, studentFiles: true }
    });
    if (!sp) return { success: true, codeContent: null, isCompleted: false, lastSavedAt: null };
    return {
      success: true,
      codeContent: sp.codeContent,
      isCompleted: sp.isCompleted,
      lastSavedAt: sp.lastSavedAt,
      lastCompilation: sp.compilationResults?.[0] || null,
      lastTest: sp.testResults?.[0] || null,
      files: sp.studentFiles
    };
  }
}

// safe JSON parse helper
JSON.parseSafe = (s) => {
  try { return JSON.parse(s); } catch { return null; }
};

export default StudentWorkspaceService;


