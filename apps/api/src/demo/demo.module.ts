import { Module, OnModuleInit } from '@nestjs/common';
import { DemoSeedService } from './demo-seed.service';
import { ScenarioRegistry } from './scenarios/scenario.registry';
import { OnlineSchoolScenario } from './scenarios/online-school/online-school.scenario';

@Module({
  providers: [DemoSeedService, ScenarioRegistry, OnlineSchoolScenario],
  exports: [DemoSeedService, ScenarioRegistry],
})
export class DemoModule implements OnModuleInit {
  constructor(
    private readonly registry: ScenarioRegistry,
    private readonly onlineSchool: OnlineSchoolScenario,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.onlineSchool);
  }
}
