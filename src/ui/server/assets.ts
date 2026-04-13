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

type WebAssetRootResolutionOptions = {
  cwd?: string;
  moduleFilePath?: string;
  runtimeEntryPath?: string;
};

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveRealPath(candidate: string | undefined): Promise<string | null> {
  if (!candidate) {
    return null;
  }

  const resolvedCandidate = path.resolve(candidate);
  try {
    return await fs.realpath(resolvedCandidate);
  } catch {
    return resolvedCandidate;
  }
}

async function resolveSearchDirectory(candidate: string | undefined): Promise<string | null> {
  const resolvedPath = await resolveRealPath(candidate);
  if (!resolvedPath) {
    return null;
  }

  try {
    const stats = await fs.stat(resolvedPath);
    return stats.isDirectory() ? resolvedPath : path.dirname(resolvedPath);
  } catch {
    return path.dirname(resolvedPath);
  }
}

function listAncestorDirectories(startDir: string): string[] {
  const directories: string[] = [];
  let currentDir = path.resolve(startDir);

  while (true) {
    directories.push(currentDir);
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return directories;
    }

    currentDir = parentDir;
  }
}

function findNearestDistDirectory(startDir: string): string | null {
  for (const directory of listAncestorDirectories(startDir)) {
    if (path.basename(directory) === 'dist') {
      return directory;
    }
  }

  return null;
}

/**
 * Global `skm` launches often arrive through a shim or symlink.
 * We resolve from the real entry file first so the packaged `dist/ui/web`
 * bundle stays discoverable even when the command starts outside the repo.
 */
async function collectWebAssetRootCandidates(options: WebAssetRootResolutionOptions = {}): Promise<string[]> {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: string): void => {
    const normalizedCandidate = path.resolve(candidate);
    if (seen.has(normalizedCandidate)) {
      return;
    }

    seen.add(normalizedCandidate);
    candidates.push(normalizedCandidate);
  };

  const searchDirectories = [
    await resolveSearchDirectory(options.runtimeEntryPath ?? process.argv[1]),
    await resolveSearchDirectory(options.moduleFilePath ?? fileURLToPath(import.meta.url)),
  ].filter((directory): directory is string => Boolean(directory));

  for (const searchDirectory of searchDirectories) {
    const distDirectory = findNearestDistDirectory(searchDirectory);
    if (distDirectory) {
      pushCandidate(path.join(distDirectory, 'ui', 'web'));
    }

    for (const directory of listAncestorDirectories(searchDirectory)) {
      if (path.basename(directory) === 'dist') {
        continue;
      }

      pushCandidate(path.join(directory, 'dist', 'ui', 'web'));
    }
  }

  pushCandidate(path.resolve(options.cwd ?? process.cwd(), 'dist', 'ui', 'web'));
  return candidates;
}

export async function resolveWebAssetRoot(
  locale: UiLocale = DEFAULT_UI_LOCALE,
  options: WebAssetRootResolutionOptions = {},
): Promise<string> {
  const candidates = await collectWebAssetRootCandidates(options);
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
