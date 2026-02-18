import { Controller, Post, Body, Req, UseGuards, HttpCode } from '@nestjs/common';
import { IngestService } from './ingest.service';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { TrackEventSchema, BatchEventsSchema } from '../schemas/event';

@Controller('v1')
@UseGuards(ApiKeyGuard)
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('track')
  @HttpCode(202)
  async track(@Req() req: any, @Body() body: unknown) {
    const event = TrackEventSchema.parse(body);
    await this.ingestService.trackEvent(req.projectId, event, req.ip, req.headers['user-agent']);
    return { ok: true };
  }

  @Post('batch')
  @HttpCode(202)
  async batch(@Req() req: any, @Body() body: unknown) {
    const { events } = BatchEventsSchema.parse(body);
    await this.ingestService.trackBatch(req.projectId, events, req.ip, req.headers['user-agent']);
    return { ok: true, count: events.length };
  }
}
