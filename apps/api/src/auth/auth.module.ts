import { Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './session-cleanup.service';
import { VerificationModule } from '../verification/verification.module';

@Module({
  imports: [VerificationModule],
  providers: [AuthService, AccountService, SessionCleanupService],
  exports: [AuthService, AccountService],
})
export class AuthModule {}
