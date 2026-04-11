import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const uiBuildDir = path.join(repoRoot, 'dist', 'ui', 'web');

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function withUiBuildSandbox<T>(prepare: () => Promise<void>, callback: (assetRoot: string) => Promise<T>): Promise<T> {
  const backupDir = (await pathExists(uiBuildDir)) ? `${uiBuildDir}.__backup__` : null;

  if (backupDir) {
    await fs.rm(backupDir, { recursive: true, force: true });
    await fs.rename(uiBuildDir, backupDir);
  }

  await fs.rm(uiBuildDir, { recursive: true, force: true });

  try {
    await prepare();
    return await callback(uiBuildDir);
  } finally {
    await fs.rm(uiBuildDir, { recursive: true, force: true });

    if (backupDir) {
      await fs.mkdir(path.dirname(uiBuildDir), { recursive: true });
      await fs.rename(backupDir, uiBuildDir);
    }
  }
}

export async function withMockUiBuild<T>(callback: (assetRoot: string) => Promise<T>): Promise<T> {
  return withUiBuildSandbox(async () => {
    await fs.mkdir(path.join(uiBuildDir, 'assets'), { recursive: true });
    await fs.writeFile(
      path.join(uiBuildDir, 'index.html'),
      [
        '<!doctype html>',
        '<html lang="en">',
        '  <head>',
        '    <meta charset="UTF-8" />',
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
        '    <title>simple-skill-manager</title>',
        '    <script type="module" crossorigin src="/assets/app.js"></script>',
        '    <link rel="stylesheet" crossorigin href="/assets/styles.css">',
        '  </head>',
        '  <body>',
        '    <div id="app"></div>',
        '  </body>',
        '</html>',
      ].join('\n'),
      'utf8',
    );
    await fs.writeFile(path.join(uiBuildDir, 'assets', 'app.js'), 'console.log("mock ui build");\n', 'utf8');
    await fs.writeFile(path.join(uiBuildDir, 'assets', 'styles.css'), 'body { color: #111; }\n', 'utf8');
  }, callback);
}

export async function withoutUiBuild<T>(callback: () => Promise<T>): Promise<T> {
  return withUiBuildSandbox(async () => {}, async () => callback());
}
