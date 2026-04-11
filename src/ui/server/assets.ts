import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SkmError } from '../../core/errors.js';
import { DEFAULT_UI_LOCALE, translateUiText, type UiLocale } from '../text.js';

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

export async function resolveWebAssetRoot(locale: UiLocale = DEFAULT_UI_LOCALE): Promise<string> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, '..', '..', '..');
  const candidates = [
    path.resolve(repoRoot, 'dist', 'ui', 'web'),
    path.resolve(process.cwd(), 'dist', 'ui', 'web'),
  ];

  for (const candidate of candidates) {
    if (await pathExists(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  throw new SkmError('runtime', translateUiText(locale, 'server.missingAssets'), {
    hint: translateUiText(locale, 'server.missingAssetsHint'),
  });
}

export async function readWebAsset(
  relativePath: string,
  locale: UiLocale = DEFAULT_UI_LOCALE,
): Promise<{ content: string; contentType: string }> {
  const assetRoot = await resolveWebAssetRoot(locale);
  const requestedPath = path.resolve(assetRoot, relativePath);
  if (!requestedPath.startsWith(assetRoot)) {
    throw new SkmError('usage', translateUiText(locale, 'server.invalidAssetPath'), {
      hint: translateUiText(locale, 'server.invalidAssetPathHint'),
    });
  }

  let content: string;
  try {
    content = await fs.readFile(requestedPath, 'utf8');
  } catch (error) {
    throw new SkmError('config', translateUiText(locale, 'server.missingAsset', { path: relativePath }), {
      details: error instanceof Error ? error.message : String(error),
      hint: translateUiText(locale, 'server.missingAssetHint'),
      cause: error,
    });
  }

  const contentType = MIME_TYPES[path.extname(requestedPath)] ?? 'text/plain; charset=utf-8';
  return { content, contentType };
}
