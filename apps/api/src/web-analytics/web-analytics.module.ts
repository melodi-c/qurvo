import { Module } from '@nestjs/common';
import { WebAnalyticsService } from './web-analytics.service';

@Module({
  providers: [WebAnalyticsService],
  exports: [WebAnalyticsService],
})
export class WebAnalyticsModule {}
