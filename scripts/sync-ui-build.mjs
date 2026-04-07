import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = path.join(repoRoot, 'src', 'ui', 'web', 'build');
const webDir = path.join(repoRoot, 'src', 'ui', 'web');
const buildAssetsDir = path.join(buildDir, 'assets');
const webAssetsDir = path.join(webDir, 'assets');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function copyFile(fromPath, toPath) {
  await ensureDir(path.dirname(toPath));
  await fs.copyFile(fromPath, toPath);
}

async function sync() {
  const indexPath = path.join(buildDir, 'index.html');
  await copyFile(indexPath, path.join(webDir, 'index.html'));

  await ensureDir(webAssetsDir);
  await fs.cp(buildAssetsDir, webAssetsDir, { recursive: true, force: true });
  await fs.rm(buildDir, { recursive: true, force: true });
}

await sync();
