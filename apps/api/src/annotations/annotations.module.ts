import { Module } from '@nestjs/common';
import { AnnotationsService } from './annotations.service';

@Module({
  providers: [AnnotationsService],
  exports: [AnnotationsService],
})
export class AnnotationsModule {}
