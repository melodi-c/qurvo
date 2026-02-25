import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    projectId: string;
    quotaLimited: boolean;
  }
}
