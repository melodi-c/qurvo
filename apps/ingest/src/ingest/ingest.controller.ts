import { Controller, Post, Get, Body, Ip, Headers, Query, Req, Res, UseGuards, HttpCode, HttpException, Logger } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { IngestService } from './ingest.service';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { BillingGuard } from '../guards/billing.guard';
import { ProjectId } from '../decorators/project-id.decorator';
import { BatchWrapperSchema, TrackEventSchema, type TrackEvent } from '../schemas/event';
import { ImportBatchSchema } from '../schemas/import-event';

@Controller()
export class IngestController {
  private readonly logger = new Logger(IngestController.name);

  constructor(private readonly ingestService: IngestService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Post('v1/batch')
  @UseGuards(ApiKeyGuard, BillingGuard)
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
    let dropped = 0;
    for (const raw of rawEvents) {
      const result = TrackEventSchema.safeParse(raw);
      if (result.success) {
        validEvents.push(result.data);
      } else {
        dropped++;
      }
    }

    if (validEvents.length === 0) {
      throw new HttpException(
        { statusCode: 400, message: 'All events failed validation', count: 0, dropped },
        400,
      );
    }

    if (dropped > 0) {
      this.logger.warn({ projectId, dropped, total: rawEvents.length }, 'Some events dropped due to validation');
    }

    await this.ingestService.trackBatch(projectId, validEvents, ip, userAgent, sent_at);

    // sendBeacon() — return 204 No Content (browser ignores response body)
    if (beacon === '1') {
      reply.status(204);
      return;
    }

    reply.status(202);
    return { ok: true, count: validEvents.length, dropped };
  }

  @Post('v1/import')
  @HttpCode(202)
  @UseGuards(ApiKeyGuard)
  async import(
    @ProjectId() projectId: string,
    @Body() body: unknown,
  ) {
    const { events } = ImportBatchSchema.parse(body);
    await this.ingestService.importBatch(projectId, events);
    return { ok: true, count: events.length };
  }
}
