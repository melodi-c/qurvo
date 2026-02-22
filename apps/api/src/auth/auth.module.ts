import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './session-cleanup.service';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [VerificationModule],
  providers: [AuthService, SessionCleanupService],
  exports: [AuthService],
})
export class AuthModule {}
