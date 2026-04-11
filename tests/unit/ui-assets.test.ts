import { describe, expect, it } from 'vitest';

import { readWebAsset, resolveWebAssetRoot } from '../../src/ui/server/assets.js';
import { withMockUiBuild, withoutUiBuild } from '../helpers/ui-build.js';

describe('ui asset resolution', () => {
  it('reads built assets from dist/ui/web', async () => {
    await withMockUiBuild(async (assetRoot) => {
      await expect(resolveWebAssetRoot()).resolves.toBe(assetRoot);

      const indexAsset = await readWebAsset('index.html');
      expect(indexAsset.contentType).toContain('text/html');
      expect(indexAsset.content).toContain('/assets/app.js');
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
