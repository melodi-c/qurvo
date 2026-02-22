import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
