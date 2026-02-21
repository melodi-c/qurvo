import { Module } from '@nestjs/common';
import { MarketingChannelsService } from './marketing-channels.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [MarketingChannelsService],
  exports: [MarketingChannelsService],
})
export class MarketingChannelsModule {}
