import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    projectId: string;
    eventsLimit: number | null;
  }
}
