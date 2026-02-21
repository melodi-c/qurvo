import { Module } from '@nestjs/common';
import { UnitEconomicsService } from './unit-economics.service';
import { ProjectsModule } from '../projects/projects.module';
import { AdSpendModule } from '../ad-spend/ad-spend.module';
import { MarketingChannelsModule } from '../marketing-channels/marketing-channels.module';

@Module({
  imports: [ProjectsModule, AdSpendModule, MarketingChannelsModule],
  providers: [UnitEconomicsService],
  exports: [UnitEconomicsService],
})
export class UnitEconomicsModule {}
