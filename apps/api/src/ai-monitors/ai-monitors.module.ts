import { Module } from '@nestjs/common';
import { AiMonitorsService } from './ai-monitors.service';

@Module({
  providers: [AiMonitorsService],
  exports: [AiMonitorsService],
})
export class AiMonitorsModule {}
