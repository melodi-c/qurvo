import { Module } from '@nestjs/common';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './session-cleanup.service';
import { VerificationModule } from '../verification/verification.module';
import { DemoModule } from '../demo/demo.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [VerificationModule, DemoModule, ProjectsModule],
  providers: [AuthService, AccountService, SessionCleanupService],
  exports: [AuthService, AccountService],
})
export class AuthModule {}
