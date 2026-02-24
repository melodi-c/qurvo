import { Module } from '@nestjs/common';
import { SavedInsightsService } from './saved-insights.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [SavedInsightsService],
  exports: [SavedInsightsService],
})
export class SavedInsightsModule {}
