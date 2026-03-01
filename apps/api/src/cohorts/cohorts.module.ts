import { Module, forwardRef } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CohortsService } from './cohorts.service';
import { StaticCohortsService } from './static-cohorts.service';

@Module({
  imports: [forwardRef(() => AnalyticsModule)],
  providers: [CohortsService, StaticCohortsService],
  exports: [CohortsService, StaticCohortsService],
})
export class CohortsModule {}
