import fs from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.lstat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(tempPath, payload, 'utf8');
  await fs.rename(tempPath, filePath);
}

export async function writeTextFileAtomic(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
}

export async function writeTextFileIfMissing(filePath: string, content: string): Promise<boolean> {
  if (await pathExists(filePath)) {
    return false;
  }

  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
  return true;
}

export async function copyDirectory(sourcePath: string, targetPath: string): Promise<void> {
  await fs.cp(sourcePath, targetPath, { recursive: true });
}

export async function movePath(sourcePath: string, targetPath: string): Promise<void> {
  await ensureDir(path.dirname(targetPath));
  await fs.rename(sourcePath, targetPath);
}

export async function removePath(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

export async function readLinkTarget(targetPath: string): Promise<string | null> {
  try {
    return await fs.readlink(targetPath);
  } catch {
    return null;
  }
}

export async function appendLineIfMissing(filePath: string, line: string): Promise<boolean> {
  const exists = await pathExists(filePath);
  if (!exists) {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, `${line}\n`, 'utf8');
    return true;
  }

  const current = await fs.readFile(filePath, 'utf8');
  const lines = current.split(/\r?\n/).filter((entry) => entry.length > 0);
  if (lines.includes(line)) {
    return false;
  }

  const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  await fs.appendFile(filePath, `${prefix}${line}\n`, 'utf8');
  return true;
}
