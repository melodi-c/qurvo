import { Module } from '@nestjs/common';
import { WebAnalyticsService } from './web-analytics.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [WebAnalyticsService],
  exports: [WebAnalyticsService],
})
export class WebAnalyticsModule {}
