import { Injectable, NestMiddleware } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { gunzipSync } from 'node:zlib';

@Injectable()
export class GzipMiddleware implements NestMiddleware {
  use(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.headers['content-encoding'] !== 'gzip') {
      return next();
    }

    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const compressed = Buffer.concat(chunks);
        const decompressed = gunzipSync(compressed);
        const json = JSON.parse(decompressed.toString('utf-8'));

        delete req.headers['content-encoding'];
        req.headers['content-type'] = 'application/json';
        (req as any).body = json;

        next();
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid gzip payload' }));
      }
    });

    req.on('error', () => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request read error' }));
    });
  }
}
