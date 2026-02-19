import { Module } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [DashboardsService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
