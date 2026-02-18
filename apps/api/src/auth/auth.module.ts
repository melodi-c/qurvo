import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './session-cleanup.service';

@Module({
  providers: [AuthService, SessionCleanupService],
  exports: [AuthService],
})
export class AuthModule {}
