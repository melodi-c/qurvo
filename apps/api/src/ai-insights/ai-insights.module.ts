import { Module } from '@nestjs/common';
import { AiInsightsService } from './ai-insights.service';

@Module({
  providers: [AiInsightsService],
  exports: [AiInsightsService],
})
export class AiInsightsModule {}
