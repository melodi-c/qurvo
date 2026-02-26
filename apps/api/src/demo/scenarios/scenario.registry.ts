import { Injectable } from '@nestjs/common';
import { BaseScenario } from './base.scenario';

@Injectable()
export class ScenarioRegistry {
  private readonly scenarios = new Map<string, BaseScenario>();

  register(scenario: BaseScenario): void {
    this.scenarios.set(scenario.getScenarioName(), scenario);
  }

  get(name: string): BaseScenario | undefined {
    return this.scenarios.get(name);
  }

  list(): string[] {
    return Array.from(this.scenarios.keys());
  }
}
