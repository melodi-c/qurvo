import { Module } from '@nestjs/common';
import { IsStaffGuard } from './guards/is-staff.guard';
import { AdminService } from './admin.service';

@Module({
  providers: [IsStaffGuard, AdminService],
  exports: [IsStaffGuard, AdminService],
})
export class AdminModule {}
