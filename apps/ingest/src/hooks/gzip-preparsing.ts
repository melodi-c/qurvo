import { createGunzip } from 'node:zlib';
import { Transform } from 'node:stream';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { MAX_DECOMPRESSED_BYTES, BODY_READ_TIMEOUT_MS } from '../constants';

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

export function addGzipPreParsing(fastify: FastifyInstance): void {
  fastify.addHook('preParsing', async (request, _reply, payload) => {
    const guarded = withReadTimeout(payload);

    if (request.headers['content-encoding'] === 'gzip') {
      delete request.headers['content-encoding'];
      delete request.headers['content-length'];
      request.headers['content-type'] = 'application/json';
      return createBoundedGunzip(guarded);
    }

    // Auto-detect gzip by magic bytes for non-JSON content types
    // (handles SDKs/proxies that compress but omit Content-Encoding)
    if (!String(request.headers['content-type']).includes('application/json')) {
      return createGzipAutoDetect(request, guarded);
    }

    return guarded;
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

function isGzipHeader(buf: Buffer): boolean {
  return buf[0] === GZIP_MAGIC_0 && buf[1] === GZIP_MAGIC_1;
}

function createGzipAutoDetect(request: FastifyRequest, source: NodeJS.ReadableStream): NodeJS.ReadableStream {
  let headerBuf: Buffer | null = null;
  let decided = false;
  let gunzip: ReturnType<typeof createGunzip> | null = null;
  let decompressedBytes = 0;

  const out = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      if (decided) {
        return gunzip ? gunzip.write(chunk, cb) : void (this.push(chunk), cb());
      }

      headerBuf = headerBuf ? Buffer.concat([headerBuf, chunk]) : chunk;
      if (headerBuf.length < 2) {
        cb();
        return;
      }

      decided = true;

      if (isGzipHeader(headerBuf)) {
        delete request.headers['content-encoding'];
        delete request.headers['content-length'];
        request.headers['content-type'] = 'application/json';

        gunzip = createGunzip();
        const gz = gunzip;
        gz.on('data', (d: Buffer) => {
          decompressedBytes += d.length;
          if (decompressedBytes > MAX_DECOMPRESSED_BYTES) {
            gz.destroy(new Error('Decompressed payload exceeds maximum allowed size'));
            return;
          }
          out.push(d);
        });
        gz.on('error', (e) => out.destroy(e));
        gz.write(headerBuf, cb);
      } else {
        this.push(headerBuf);
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

/**
 * Wraps a readable stream with a per-chunk read timeout.
 * If no data arrives within BODY_READ_TIMEOUT_MS the stream is destroyed,
 * protecting against stalled mobile uploads that hold connections open.
 */
function withReadTimeout(source: NodeJS.ReadableStream): NodeJS.ReadableStream {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const resetTimer = () => {
    if (timer) {clearTimeout(timer);}
    timer = setTimeout(() => {
      wrapper.destroy(new Error('Body read timeout — client stopped sending data'));
    }, BODY_READ_TIMEOUT_MS);
  };

  const wrapper = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      resetTimer();
      cb(null, chunk);
    },
    flush(cb) {
      if (timer) {clearTimeout(timer);}
      cb();
    },
  });

  source.pipe(wrapper);
  source.on('error', (e) => wrapper.destroy(e));
  wrapper.on('close', () => { if (timer) {clearTimeout(timer);} });

  resetTimer();
  return wrapper;
}
