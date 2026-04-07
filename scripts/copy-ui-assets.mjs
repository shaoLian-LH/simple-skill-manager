import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, 'src', 'ui', 'web');
const targetDir = path.join(repoRoot, 'dist', 'ui', 'web');

async function ensureSourceExists() {
  try {
    const stat = await fs.stat(sourceDir);
    if (!stat.isDirectory()) {
      throw new Error('source is not a directory');
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Missing UI source assets at ${sourceDir}: ${details}`);
  }
}

await ensureSourceExists();
await fs.rm(targetDir, { recursive: true, force: true });
await fs.mkdir(path.dirname(targetDir), { recursive: true });
await fs.cp(sourceDir, targetDir, { recursive: true });

