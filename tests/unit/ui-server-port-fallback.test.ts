import net from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

import { startUiServer } from '../../src/ui/server/server.js';

async function listenEphemeral(): Promise<net.Server> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  return server;
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe('ui server port fallback', () => {
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanup.length > 0) {
      const next = cleanup.pop();
      if (next) {
        await next();
      }
    }
  });

  it('falls back when preferred port is occupied and exposes launch status API', async () => {
    const occupiedServer = await listenEphemeral();
    cleanup.push(() => closeServer(occupiedServer));

    const occupiedAddress = occupiedServer.address();
    if (!occupiedAddress || typeof occupiedAddress === 'string') {
      throw new Error('expected numeric occupied address');
    }

    const uiServer = await startUiServer({
      preferredPort: occupiedAddress.port,
      maxPortFallbackSteps: 5,
    });
    cleanup.push(() => uiServer.stop());

    expect(uiServer.launchStatus.usedPortFallback).toBe(true);
    expect(uiServer.launchStatus.port).not.toBe(occupiedAddress.port);

    const response = await fetch(`${uiServer.launchStatus.url}/api/launch-status`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { ok: boolean; data: { port: number; usedPortFallback: boolean } };
    expect(body.ok).toBe(true);
    expect(body.data.usedPortFallback).toBe(true);
    expect(body.data.port).toBe(uiServer.launchStatus.port);
  });
});

