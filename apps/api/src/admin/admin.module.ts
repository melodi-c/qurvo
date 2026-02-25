import { Module } from '@nestjs/common';
import { IsStaffGuard } from './guards/is-staff.guard';
import { AdminStatsController } from './controllers/admin-stats.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminProjectsController } from './controllers/admin-projects.controller';
import { AdminPlansController } from './controllers/admin-plans.controller';

@Module({
  controllers: [AdminStatsController, AdminUsersController, AdminProjectsController, AdminPlansController],
  providers: [IsStaffGuard],
})
export class AdminModule {}
