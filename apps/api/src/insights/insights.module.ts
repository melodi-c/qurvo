import { Module } from '@nestjs/common';
import { InsightsService } from './insights.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
