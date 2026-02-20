import { Module } from '@nestjs/common';
import { FunnelService } from './funnel.service';
import { ProjectsModule } from '../projects/projects.module';
import { CohortsModule } from '../cohorts/cohorts.module';

@Module({
  imports: [ProjectsModule, CohortsModule],
  providers: [FunnelService],
  exports: [FunnelService],
})
export class FunnelModule {}
