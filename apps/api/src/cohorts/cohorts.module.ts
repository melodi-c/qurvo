import { Module } from '@nestjs/common';
import { CohortsService } from './cohorts.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [CohortsService],
  exports: [CohortsService],
})
export class CohortsModule {}
