import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SkmError } from '../../core/errors.js';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function resolveWebAssetRoot(): Promise<string> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(currentDir, '..', 'web'),
    path.resolve(currentDir, 'ui', 'web'),
    path.resolve(process.cwd(), 'src', 'ui', 'web'),
    path.resolve(process.cwd(), 'dist', 'ui', 'web'),
  ];

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  throw new SkmError('runtime', 'Unable to locate Web UI assets.', {
    hint: 'Build the package or ensure `src/ui/web` is present.',
  });
}

export async function readWebAsset(relativePath: string): Promise<{ content: string; contentType: string }> {
  const assetRoot = await resolveWebAssetRoot();
  const requestedPath = path.resolve(assetRoot, relativePath);
  if (!requestedPath.startsWith(assetRoot)) {
    throw new SkmError('usage', 'Invalid asset path.', {
      hint: 'Request assets inside the Web UI bundle only.',
    });
  }

  let content: string;
  try {
    content = await fs.readFile(requestedPath, 'utf8');
  } catch (error) {
    throw new SkmError('config', `Missing Web UI asset: ${relativePath}.`, {
      details: error instanceof Error ? error.message : String(error),
      hint: 'Rebuild the package so static assets are available.',
      cause: error,
    });
  }

  const contentType = MIME_TYPES[path.extname(requestedPath)] ?? 'text/plain; charset=utf-8';
  return { content, contentType };
}
