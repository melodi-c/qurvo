import { Controller, Post, Get, Body, Ip, Headers, UseGuards, HttpCode } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { IngestService } from './ingest.service';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { ProjectId } from '../decorators/project-id.decorator';
import { TrackEventSchema, BatchEventsSchema } from '../schemas/event';
import { ImportBatchSchema } from '../schemas/import-event';

@Controller()
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Get('health')
  @SkipThrottle()
  health() {
    return { status: 'ok' };
  }

  @Post('v1/track')
  @HttpCode(202)
  @UseGuards(ApiKeyGuard)
  async track(
    @ProjectId() projectId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Body() body: unknown,
  ) {
    const event = TrackEventSchema.parse(body);
    await this.ingestService.trackEvent(projectId, event, ip, userAgent);
    return { ok: true };
  }

  @Post('v1/batch')
  @HttpCode(202)
  @UseGuards(ApiKeyGuard)
  async batch(
    @ProjectId() projectId: string,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string | undefined,
    @Body() body: unknown,
  ) {
    const { events, sent_at } = BatchEventsSchema.parse(body);
    await this.ingestService.trackBatch(projectId, events, ip, userAgent, sent_at);
    return { ok: true, count: events.length };
  }

  @Post('v1/import')
  @HttpCode(202)
  @UseGuards(ApiKeyGuard)
  @SkipThrottle()
  async import(
    @ProjectId() projectId: string,
    @Body() body: unknown,
  ) {
    const { events } = ImportBatchSchema.parse(body);
    await this.ingestService.importBatch(projectId, events);
    return { ok: true, count: events.length };
  }
}
