import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { SkmError } from '../../core/errors.js';
import type { LaunchStatusView } from '../contracts/api.js';
import { UiFacade } from '../facade/service.js';
import { createUiRequestHandler } from './app.js';

export const UI_DEFAULT_HOST = '127.0.0.1';
export const UI_DEFAULT_PORT = 11451;
export const UI_MAX_PORT_FALLBACK_STEPS = 20;

async function listenOnPort(server: Server, host: string, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export interface StartUiServerOptions {
  host?: string;
  preferredPort?: number;
  maxPortFallbackSteps?: number;
  launchCwd?: string;
  facade?: UiFacade;
}

export interface UiServerHandle {
  launchStatus: LaunchStatusView;
  stop: () => Promise<void>;
}

export async function startUiServer(options: StartUiServerOptions = {}): Promise<UiServerHandle> {
  const host = options.host ?? UI_DEFAULT_HOST;
  const preferredPort = options.preferredPort ?? UI_DEFAULT_PORT;
  const maxPortFallbackSteps = options.maxPortFallbackSteps ?? UI_MAX_PORT_FALLBACK_STEPS;
  const launchCwd = options.launchCwd ?? process.cwd();

  const launchStatus: LaunchStatusView = {
    host,
    requestedPort: preferredPort,
    port: preferredPort,
    usedPortFallback: false,
    url: `http://${host}:${preferredPort}`,
    browserAttempted: false,
    browserOpened: false,
  };

  const facade = options.facade ?? new UiFacade();
  const server = createServer(async (request, response) => {
    const handler = createUiRequestHandler({
      facade,
      getLaunchStatus: () => launchStatus,
      getBoot: () => facade.getBoot(launchCwd, launchStatus),
    });
    await handler(request, response);
  });

  let listenError: unknown;
  for (let offset = 0; offset <= maxPortFallbackSteps; offset += 1) {
    const candidatePort = preferredPort + offset;
    try {
      await listenOnPort(server, host, candidatePort);
      const address = server.address() as AddressInfo | null;
      if (!address || typeof address.port !== 'number') {
        throw new SkmError('runtime', 'Failed to resolve bound server address.');
      }

      launchStatus.port = address.port;
      launchStatus.usedPortFallback = address.port !== preferredPort;
      launchStatus.url = `http://${host}:${address.port}`;
      listenError = undefined;
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EADDRINUSE' && offset < maxPortFallbackSteps) {
        continue;
      }

      listenError = error;
      break;
    }
  }

  if (listenError) {
    throw new SkmError('runtime', 'Failed to bind UI server port.', {
      details: listenError instanceof Error ? listenError.message : String(listenError),
      hint: `Check whether ports ${preferredPort}-${preferredPort + maxPortFallbackSteps} are available.`,
      cause: listenError,
    });
  }

  return {
    launchStatus,
    stop: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
