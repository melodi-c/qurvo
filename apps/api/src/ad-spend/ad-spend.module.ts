import { Module } from '@nestjs/common';
import { AdSpendService } from './ad-spend.service';
import { ProjectsModule } from '../projects/projects.module';
import { MarketingChannelsModule } from '../marketing-channels/marketing-channels.module';

@Module({
  imports: [ProjectsModule, MarketingChannelsModule],
  providers: [AdSpendService],
  exports: [AdSpendService],
})
export class AdSpendModule {}
