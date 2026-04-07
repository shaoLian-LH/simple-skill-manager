import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExitCode } from '../../src/core/errors.js';
import { runCli } from '../../src/cli/program.js';

describe('ui CLI command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes parsed options into ui runtime', async () => {
    const run = vi.fn(async () => {});

    const exitCode = await runCli(['node', 'skm', 'ui', '--port', '15432', '--no-open'], {
      uiRuntime: { run },
    });

    expect(exitCode).toBe(ExitCode.Success);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 15432,
        noOpen: true,
      }),
    );
  });

  it('fails with usage error when ui port is invalid', async () => {
    let stderr = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    });

    const exitCode = await runCli(['node', 'skm', 'ui', '--port', '99999'], {
      uiRuntime: {
        run: vi.fn(async () => {}),
      },
    });

    expect(exitCode).toBe(ExitCode.Usage);
    expect(stderr).toContain('Invalid port');
  });
});
