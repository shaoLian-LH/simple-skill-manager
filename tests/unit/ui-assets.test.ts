import fs from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readWebAsset, resolveWebAssetRoot } from '../../src/ui/server/assets.js';
import { withTempDir } from '../helpers/temp.js';
import { withMockUiBuild, withoutUiBuild } from '../helpers/ui-build.js';

async function writeMockUiIndex(assetRoot: string, marker: string): Promise<void> {
  await fs.mkdir(assetRoot, { recursive: true });
  await fs.writeFile(
    path.join(assetRoot, 'index.html'),
    `<!doctype html><html><body><div id="app">${marker}</div></body></html>\n`,
    'utf8',
  );
}

describe('ui asset resolution', () => {
  it('reads built assets from dist/ui/web', async () => {
    await withMockUiBuild(async (assetRoot) => {
      await expect(resolveWebAssetRoot()).resolves.toBe(assetRoot);

      const indexAsset = await readWebAsset('index.html');
      expect(indexAsset.contentType).toContain('text/html');
      expect(indexAsset.content).toContain('/assets/app.js');
    });
  });

  it('prefers packaged assets over cwd fallback for linked launches', async () => {
    await withMockUiBuild(async (assetRoot) => {
      await withTempDir('skm-ui-linked-', async (tempDir) => {
        const cwdAssetRoot = path.join(tempDir, 'dist', 'ui', 'web');
        await writeMockUiIndex(cwdAssetRoot, 'cwd-build');

        const linkedEntryPath = path.join(tempDir, 'bin', 'skm');
        await fs.mkdir(path.dirname(linkedEntryPath), { recursive: true });
        await fs.symlink(path.resolve('src', 'bin', 'skm.ts'), linkedEntryPath);

        await expect(
          resolveWebAssetRoot('en-US', {
            cwd: tempDir,
            runtimeEntryPath: linkedEntryPath,
            moduleFilePath: path.join(tempDir, 'isolated', 'assets.js'),
          }),
        ).resolves.toBe(assetRoot);
      });
    });
  });

  it('falls back to cwd build when packaged assets are missing', async () => {
    await withoutUiBuild(async () => {
      await withTempDir('skm-ui-cwd-', async (tempDir) => {
        const cwdAssetRoot = path.join(tempDir, 'dist', 'ui', 'web');
        await writeMockUiIndex(cwdAssetRoot, 'cwd-build');

        await expect(
          resolveWebAssetRoot('en-US', {
            cwd: tempDir,
            runtimeEntryPath: path.join(tempDir, 'bin', 'skm'),
            moduleFilePath: path.join(tempDir, 'isolated', 'assets.js'),
          }),
        ).resolves.toBe(cwdAssetRoot);
      });
    });
  });

  it('reports build guidance when assets are missing', async () => {
    await withoutUiBuild(async () => {
      await expect(resolveWebAssetRoot('en-US')).rejects.toMatchObject({
        kind: 'runtime',
        hint: 'Run `pnpm run build:web` or `pnpm run build` to generate the Web UI assets first.',
      });
    });
  });
});
