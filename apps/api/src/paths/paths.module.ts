import { Module } from '@nestjs/common';
import { PathsService } from './paths.service';
import { ProjectsModule } from '../projects/projects.module';
import { CohortsModule } from '../cohorts/cohorts.module';

@Module({
  imports: [ProjectsModule, CohortsModule],
  providers: [PathsService],
  exports: [PathsService],
})
export class PathsModule {}
