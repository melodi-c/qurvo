import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service';
import { ProjectsModule } from '../projects/projects.module';
import { CohortsModule } from '../cohorts/cohorts.module';

@Module({
  imports: [ProjectsModule, CohortsModule],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
