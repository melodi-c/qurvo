import { Module } from '@nestjs/common';
import { CohortsService } from './cohorts.service';
import { StaticCohortsService } from './static-cohorts.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [CohortsService, StaticCohortsService],
  exports: [CohortsService, StaticCohortsService],
})
export class CohortsModule {}
