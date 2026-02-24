import type { INestApplication } from '@nestjs/common';
import { gzipSync } from 'node:zlib';

export { parseRedisFields } from '@qurvo/testing';

export function getBaseUrl(app: INestApplication): string {
  const server = app.getHttpServer();
  const address = server.address();
  const port = typeof address === 'object' ? address?.port : address;
  return `http://127.0.0.1:${port}`;
}

export async function postBatch(app: INestApplication, apiKey: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${getBaseUrl(app)}/v1/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

export async function postBatchBeacon(app: INestApplication, apiKey: string, body: unknown): Promise<{ status: number; body: string }> {
  const res = await fetch(`${getBaseUrl(app)}/v1/batch?beacon=1`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

export async function postBatchGzip(app: INestApplication, apiKey: string, body: unknown): Promise<{ status: number; body: any }> {
  const compressed = gzipSync(JSON.stringify(body));
  const res = await fetch(`${getBaseUrl(app)}/v1/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Content-Encoding': 'gzip',
      'x-api-key': apiKey,
    },
    body: compressed,
  });
  return { status: res.status, body: await res.json() };
}

/** Send gzip-compressed body WITHOUT Content-Encoding header (auto-detect scenario) */
export async function postBatchGzipNoHeader(app: INestApplication, apiKey: string, body: unknown): Promise<{ status: number; body: any }> {
  const compressed = gzipSync(JSON.stringify(body));
  const res = await fetch(`${getBaseUrl(app)}/v1/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'x-api-key': apiKey,
    },
    body: compressed,
  });
  return { status: res.status, body: await res.json() };
}

export async function postBatchWithBodyKey(app: INestApplication, apiKey: string, body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const res = await fetch(`${getBaseUrl(app)}/v1/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...body, api_key: apiKey }),
  });
  return { status: res.status, body: await res.json() };
}

export async function postImport(app: INestApplication, apiKey: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${getBaseUrl(app)}/v1/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
