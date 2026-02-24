import { Module } from '@nestjs/common';
import { SavedInsightsService } from './saved-insights.service';

@Module({
  providers: [SavedInsightsService],
  exports: [SavedInsightsService],
})
export class SavedInsightsModule {}
