import { createGunzip } from 'node:zlib';
import type { FastifyInstance } from 'fastify';

export function addGzipPreParsing(fastify: FastifyInstance): void {
  fastify.addHook('preParsing', async (request, _reply, payload) => {
    if (request.headers['content-encoding'] === 'gzip') {
      delete request.headers['content-encoding'];
      delete request.headers['content-length'];
      request.headers['content-type'] = 'application/json';
      return payload.pipe(createGunzip());
    }
    return payload;
  });
}
