import { Module } from '@nestjs/common';
import { DemoSeedService } from './demo-seed.service';
import { ScenarioRegistry } from './scenarios/scenario.registry';

@Module({
  providers: [DemoSeedService, ScenarioRegistry],
  exports: [DemoSeedService, ScenarioRegistry],
})
export class DemoModule {}
