import { Module } from '@nestjs/common';
import { LifecycleService } from './lifecycle.service';
import { ProjectsModule } from '../projects/projects.module';
import { CohortsModule } from '../cohorts/cohorts.module';

@Module({
  imports: [ProjectsModule, CohortsModule],
  providers: [LifecycleService],
  exports: [LifecycleService],
})
export class LifecycleModule {}
