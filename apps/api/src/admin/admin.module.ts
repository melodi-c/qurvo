import { Module } from '@nestjs/common';
import { IsStaffGuard } from './guards/is-staff.guard';
import { AdminStatsController } from './controllers/admin-stats.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminPlansController } from './controllers/admin-plans.controller';

@Module({
  controllers: [AdminStatsController, AdminUsersController, AdminPlansController],
  providers: [IsStaffGuard],
})
export class AdminModule {}
