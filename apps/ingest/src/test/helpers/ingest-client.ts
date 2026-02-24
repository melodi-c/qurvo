import type { INestApplication } from '@nestjs/common';
import { gzipSync } from 'node:zlib';

export function getBaseUrl(app: INestApplication): string {
  const server = app.getHttpServer();
  const address = server.address();
  const port = typeof address === 'object' ? address?.port : address;
  return `http://127.0.0.1:${port}`;
}

export async function postTrack(app: INestApplication, apiKey: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${getBaseUrl(app)}/v1/track`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
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

export async function postTrackGzip(app: INestApplication, apiKey: string, body: unknown): Promise<{ status: number; body: any }> {
  const compressed = gzipSync(JSON.stringify(body));
  const res = await fetch(`${getBaseUrl(app)}/v1/track`, {
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

export function parseRedisFields(fields: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < fields.length; i += 2) {
    result[fields[i]] = fields[i + 1];
  }
  return result;
}
