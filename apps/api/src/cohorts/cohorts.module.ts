import { Module, forwardRef } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CohortEnrichmentService } from './cohort-enrichment.service';
import { CohortsService } from './cohorts.service';
import { StaticCohortsService } from './static-cohorts.service';

@Module({
  imports: [forwardRef(() => AnalyticsModule)],
  providers: [CohortEnrichmentService, CohortsService, StaticCohortsService],
  exports: [CohortEnrichmentService, CohortsService, StaticCohortsService],
})
export class CohortsModule {}
