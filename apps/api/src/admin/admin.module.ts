import { Module } from '@nestjs/common';
import { IsStaffGuard } from './guards/is-staff.guard';
import { AdminStatsController } from './controllers/admin-stats.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminProjectsController } from './controllers/admin-projects.controller';

@Module({
  controllers: [AdminStatsController, AdminUsersController, AdminProjectsController],
  providers: [IsStaffGuard],
})
export class AdminModule {}
