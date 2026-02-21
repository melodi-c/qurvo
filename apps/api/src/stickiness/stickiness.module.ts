import { Module } from '@nestjs/common';
import { StickinessService } from './stickiness.service';
import { ProjectsModule } from '../projects/projects.module';
import { CohortsModule } from '../cohorts/cohorts.module';

@Module({
  imports: [ProjectsModule, CohortsModule],
  providers: [StickinessService],
  exports: [StickinessService],
})
export class StickinessModule {}
