import { Module } from '@nestjs/common';
import { IngestionWarningsService } from './ingestion-warnings.service';

@Module({
  providers: [IngestionWarningsService],
  exports: [IngestionWarningsService],
})
export class IngestionWarningsModule {}
