import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function withTempDir<T>(prefix: string, callback: (dirPath: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  try {
    return await callback(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
