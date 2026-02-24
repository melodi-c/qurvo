import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { CohortMembershipService } from './cohort-membership.service';

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  constructor(
    private readonly cohortMembershipService: CohortMembershipService,
  ) {}

  async onApplicationShutdown() {
    await this.cohortMembershipService.stop();
  }
}
