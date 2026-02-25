import { Controller, Post, Get, Body, Ip, Headers, Query, Req, Res, UseGuards, HttpCode, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { IngestService } from './ingest.service';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { BillingGuard } from '../guards/billing.guard';
import { ProjectId } from '../decorators/project-id.decorator';
import { BatchWrapperSchema, TrackEventSchema, type TrackEvent } from '../schemas/event';
import { ImportBatchSchema } from '../schemas/import-event';
import { HANDLER_TIMEOUT_MS } from '../constants';

@Controller()
export class IngestController {
  private readonly logger = new Logger(IngestController.name);

  constructor(private readonly ingestService: IngestService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) reply: FastifyReply) {
    const ok = await this.ingestService.isReady();
    if (!ok) {
      reply.status(503);
      return { status: 'not ready' };
    }
    return { status: 'ok' };
  }

  @Post('v1/batch')
  @UseGuards(ApiKeyGuard, RateLimitGuard, BillingGuard)
  async batch(
    @ProjectId() projectId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Query('beacon') beacon: string | undefined,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    // Quota exceeded — return 200 to prevent SDK retries (PostHog pattern)
    if (request.quotaLimited) {
      if (beacon === '1') {
        reply.status(204);
        return;
      }
      reply.status(200);
      return { ok: true, quota_limited: true };
    }

    const { events: rawEvents, sent_at } = BatchWrapperSchema.parse(body);

    const validEvents: TrackEvent[] = [];
    const dropReasons: { index: number; errors: unknown[] }[] = [];
    for (let i = 0; i < rawEvents.length; i++) {
      const result = TrackEventSchema.safeParse(rawEvents[i]);
      if (result.success) {
        validEvents.push(result.data);
      } else {
        dropReasons.push({ index: i, errors: result.error.issues.map((e) => ({ path: e.path, message: e.message })) });
      }
    }

    if (validEvents.length === 0) {
      throw new HttpException(
        { statusCode: 400, message: 'All events failed validation', count: 0, dropped: dropReasons.length },
        400,
      );
    }

    if (dropReasons.length > 0) {
      this.logger.warn(
        { projectId, dropped: dropReasons.length, total: rawEvents.length, reasons: dropReasons.slice(0, 5) },
        'Some events dropped due to validation',
      );
    }

    await this.callOrThrow503(() => this.ingestService.trackBatch(projectId, validEvents, ip, userAgent, sent_at), projectId, validEvents.length);

    // sendBeacon() — return 204 No Content (browser ignores response body)
    if (beacon === '1') {
      reply.status(204);
      return;
    }

    reply.status(202);
    return { ok: true, count: validEvents.length, dropped: dropReasons.length };
  }

  @Post('v1/import')
  @HttpCode(202)
  @UseGuards(ApiKeyGuard, RateLimitGuard)
  async import(
    @ProjectId() projectId: string,
    @Body() body: unknown,
  ) {
    const { events } = ImportBatchSchema.parse(body);
    await this.callOrThrow503(() => this.ingestService.importBatch(projectId, events), projectId, events.length);
    return { ok: true, count: events.length };
  }

  private async callOrThrow503(fn: () => Promise<void>, projectId: string, eventCount: number): Promise<void> {
    try {
      await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Handler timeout')), HANDLER_TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      this.logger.error({ err, projectId, eventCount }, 'Failed to write events to stream');
      throw new HttpException(
        { statusCode: HttpStatus.SERVICE_UNAVAILABLE, message: 'Event ingestion temporarily unavailable', retryable: true },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
