import { Module } from '@nestjs/common';
import { FunnelService } from './funnel.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [FunnelService],
  exports: [FunnelService],
})
export class FunnelModule {}
