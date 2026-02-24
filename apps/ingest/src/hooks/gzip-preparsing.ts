import { createGunzip } from 'node:zlib';
import { Transform } from 'node:stream';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { MAX_DECOMPRESSED_BYTES } from '../constants';

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

export function addGzipPreParsing(fastify: FastifyInstance): void {
  fastify.addHook('preParsing', async (request, _reply, payload) => {
    if (request.headers['content-encoding'] === 'gzip') {
      delete request.headers['content-encoding'];
      delete request.headers['content-length'];
      request.headers['content-type'] = 'application/json';
      return createBoundedGunzip(payload);
    }

    // Auto-detect gzip by magic bytes for non-JSON content types
    // (handles SDKs/proxies that compress but omit Content-Encoding)
    if (!String(request.headers['content-type']).includes('application/json')) {
      return createGzipAutoDetect(request, payload);
    }

    return payload;
  });
}

function createBoundedGunzip(source: NodeJS.ReadableStream): Transform {
  const gunzip = createGunzip();
  let bytes = 0;

  const limiter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > MAX_DECOMPRESSED_BYTES) {
        cb(new Error('Decompressed payload exceeds maximum allowed size'));
        return;
      }
      cb(null, chunk);
    },
  });

  source.pipe(gunzip).pipe(limiter);
  source.on('error', (e) => limiter.destroy(e));
  gunzip.on('error', (e) => limiter.destroy(e));

  return limiter;
}

function createGzipAutoDetect(request: FastifyRequest, source: NodeJS.ReadableStream): NodeJS.ReadableStream {
  let headerBuf: Buffer | null = null;
  let decided = false;
  let gunzip: ReturnType<typeof createGunzip> | null = null;
  let decompressedBytes = 0;

  const out = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      if (!decided) {
        headerBuf = headerBuf ? Buffer.concat([headerBuf, chunk]) : chunk;
        if (headerBuf.length < 2) {
          cb();
          return;
        }

        decided = true;

        if (headerBuf[0] === GZIP_MAGIC_0 && headerBuf[1] === GZIP_MAGIC_1) {
          delete request.headers['content-encoding'];
          delete request.headers['content-length'];
          request.headers['content-type'] = 'application/json';

          gunzip = createGunzip();
          gunzip.on('data', (d: Buffer) => {
            decompressedBytes += d.length;
            if (decompressedBytes > MAX_DECOMPRESSED_BYTES) {
              gunzip!.destroy(new Error('Decompressed payload exceeds maximum allowed size'));
              return;
            }
            out.push(d);
          });
          gunzip.on('error', (e) => out.destroy(e));
          gunzip.write(headerBuf, cb);
        } else {
          this.push(headerBuf);
          cb();
        }
      } else if (gunzip) {
        gunzip.write(chunk, cb);
      } else {
        this.push(chunk);
        cb();
      }
    },
    flush(cb) {
      if (!decided && headerBuf) {
        this.push(headerBuf);
        cb();
      } else if (gunzip) {
        gunzip.once('end', cb);
        gunzip.end();
      } else {
        cb();
      }
    },
  });

  source.pipe(out);
  source.on('error', (e) => out.destroy(e));

  return out;
}
