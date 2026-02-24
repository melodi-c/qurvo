import { Module } from '@nestjs/common';
import { CohortsService } from './cohorts.service';
import { StaticCohortsService } from './static-cohorts.service';

@Module({
  providers: [CohortsService, StaticCohortsService],
  exports: [CohortsService, StaticCohortsService],
})
export class CohortsModule {}
