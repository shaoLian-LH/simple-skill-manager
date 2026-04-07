import { SkmError } from '../../core/errors.js';
import { runSystemCommand } from '../system/quick-open.js';
import { startUiServer, UI_DEFAULT_PORT } from './server.js';

export interface RunUiCommandOptions {
  port?: number;
  noOpen?: boolean;
  stdout: (payload: string) => void;
  stderr: (payload: string) => void;
}

export interface UiCommandRuntime {
  run: (options: RunUiCommandOptions) => Promise<void>;
}

function renderMessage(message: string): string {
  return `${message}\n`;
}

export async function openUrlInBrowser(url: string): Promise<void> {
  const platform = process.platform;
  if (platform === 'darwin') {
    await runSystemCommand('open', [url]);
    return;
  }

  if (platform === 'win32') {
    await runSystemCommand('cmd', ['/c', 'start', '', url]);
    return;
  }

  await runSystemCommand('xdg-open', [url]);
}

export async function waitForTerminationSignal(): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      resolve();
    };
    const onSigint = (): void => finish();
    const onSigterm = (): void => finish();

    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
  });
}

interface UiRuntimeDependencies {
  startServer: typeof startUiServer;
  openBrowser: (url: string) => Promise<void>;
  waitForSignal: () => Promise<void>;
}

function createUiRuntimeDependencies(): UiRuntimeDependencies {
  return {
    startServer: startUiServer,
    openBrowser: openUrlInBrowser,
    waitForSignal: waitForTerminationSignal,
  };
}

export function createUiCommandRuntime(deps: Partial<UiRuntimeDependencies> = {}): UiCommandRuntime {
  const runtimeDeps: UiRuntimeDependencies = {
    ...createUiRuntimeDependencies(),
    ...deps,
  };

  return {
    run: async (options: RunUiCommandOptions): Promise<void> => {
      const preferredPort = options.port ?? UI_DEFAULT_PORT;
      const server = await runtimeDeps.startServer({
        preferredPort,
      });

      options.stdout(renderMessage(`Web UI listening at ${server.launchStatus.url}`));
      if (server.launchStatus.usedPortFallback) {
        options.stdout(
          renderMessage(
            `Preferred port ${server.launchStatus.requestedPort} was in use; using ${server.launchStatus.port} instead.`,
          ),
        );
      }

      if (options.noOpen) {
        options.stdout(renderMessage('Browser auto-open skipped (--no-open).'));
      } else {
        server.launchStatus.browserAttempted = true;
        try {
          await runtimeDeps.openBrowser(server.launchStatus.url);
          server.launchStatus.browserOpened = true;
          options.stdout(renderMessage('Browser opened successfully.'));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          server.launchStatus.browserOpened = false;
          server.launchStatus.browserError = message;
          options.stderr(renderMessage(`Failed to open browser automatically: ${message}`));
        }
      }

      options.stdout(renderMessage('Press Ctrl+C to stop the UI server.'));

      try {
        await runtimeDeps.waitForSignal();
      } catch (error) {
        throw new SkmError('runtime', 'Failed while waiting for termination signal.', {
          details: error instanceof Error ? error.message : String(error),
          cause: error,
        });
      } finally {
        await server.stop();
      }
    },
  };
}

export async function runUiCommand(options: RunUiCommandOptions): Promise<void> {
  const runtime = createUiCommandRuntime();
  await runtime.run(options);
}
