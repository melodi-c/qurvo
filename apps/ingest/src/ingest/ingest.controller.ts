import { Controller, Post, Body, Ip, Headers, UseGuards, HttpCode } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { ProjectId } from '../decorators/project-id.decorator';
import { TrackEventSchema, BatchEventsSchema } from '../schemas/event';

@Controller('v1')
@UseGuards(ApiKeyGuard)
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('track')
  @HttpCode(202)
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

  @Post('batch')
  @HttpCode(202)
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
}
