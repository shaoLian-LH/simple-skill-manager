import type { IncomingMessage, ServerResponse } from 'node:http';

import { SkmError } from '../../core/errors.js';

const MAX_JSON_BODY_BYTES = 1024 * 1024;

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

export function sendHtml(response: ServerResponse, statusCode: number, html: string): void {
  sendText(response, statusCode, 'text/html; charset=utf-8', html);
}

export function sendText(response: ServerResponse, statusCode: number, contentType: string, body: string): void {
  response.writeHead(statusCode, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  response.end(body);
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += piece.byteLength;
    if (receivedBytes > MAX_JSON_BODY_BYTES) {
      throw new SkmError('usage', 'JSON body exceeds 1MB limit.', {
        hint: 'Reduce payload size and retry.',
      });
    }
    chunks.push(piece);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    throw new SkmError('usage', 'Request body must be valid JSON.', {
      details: error instanceof Error ? error.message : undefined,
      hint: 'Provide a syntactically valid JSON payload.',
      cause: error,
    });
  }
}

export function normalizePathname(requestUrl: string | undefined): string {
  if (!requestUrl) {
    return '/';
  }

  const parsed = new URL(requestUrl, 'http://localhost');
  return parsed.pathname.replace(/\/+$/, '') || '/';
}
