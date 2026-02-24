import { Module } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';

@Module({
  providers: [DashboardsService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
