import { describe, expect, it, vi } from 'vitest';

import { SkmError } from '../../src/core/errors.js';
import { createUiCommandRuntime } from '../../src/ui/server/runtime.js';

function createLaunchStatus() {
  return {
    host: '127.0.0.1',
    requestedPort: 11451,
    port: 11451,
    usedPortFallback: false,
    url: 'http://127.0.0.1:11451',
    browserAttempted: false,
    browserOpened: false,
    browserError: undefined,
  };
}

describe('ui runtime lifecycle', () => {
  it('logs startup and skips browser open when --no-open is set', async () => {
    const stop = vi.fn(async () => {});
    const startServer = vi.fn(async () => ({
      launchStatus: createLaunchStatus(),
      stop,
    }));
    const openBrowser = vi.fn(async () => {});
    const waitForSignal = vi.fn(async () => {});
    const runtime = createUiCommandRuntime({ startServer, openBrowser, waitForSignal });

    let stdout = '';
    let stderr = '';
    await runtime.run({
      noOpen: true,
      stdout: (line) => {
        stdout += line;
      },
      stderr: (line) => {
        stderr += line;
      },
    });

    expect(stderr).toBe('');
    expect(openBrowser).not.toHaveBeenCalled();
    expect(waitForSignal).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stdout).toContain('Web UI listening at http://127.0.0.1:11451');
    expect(stdout).toContain('Browser auto-open skipped (--no-open).');
    expect(stdout).toContain('Press Ctrl+C to stop the UI server.');
  });

  it('keeps server running when browser open fails and records launch status error', async () => {
    const launchStatus = createLaunchStatus();
    const stop = vi.fn(async () => {});
    const startServer = vi.fn(async () => ({
      launchStatus,
      stop,
    }));
    const runtime = createUiCommandRuntime({
      startServer,
      openBrowser: async () => {
        throw new Error('open command failed');
      },
      waitForSignal: async () => {},
    });

    let stderr = '';
    await runtime.run({
      stdout: () => {},
      stderr: (line) => {
        stderr += line;
      },
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(stderr).toContain('Failed to open browser automatically');
    expect(launchStatus.browserAttempted).toBe(true);
    expect(launchStatus.browserOpened).toBe(false);
    expect(launchStatus.browserError).toContain('open command failed');
  });

  it('wraps signal wait failures as runtime errors and still stops server', async () => {
    const stop = vi.fn(async () => {});
    const runtime = createUiCommandRuntime({
      startServer: async () => ({
        launchStatus: createLaunchStatus(),
        stop,
      }),
      openBrowser: async () => {},
      waitForSignal: async () => {
        throw new Error('signal watcher failed');
      },
    });

    await expect(
      runtime.run({
        stdout: () => {},
        stderr: () => {},
      }),
    ).rejects.toBeInstanceOf(SkmError);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
