import { Module } from '@nestjs/common';
import { TrendService } from './trend.service';
import { ProjectsModule } from '../projects/projects.module';
import { CohortsModule } from '../cohorts/cohorts.module';

@Module({
  imports: [ProjectsModule, CohortsModule],
  providers: [TrendService],
  exports: [TrendService],
})
export class TrendModule {}
