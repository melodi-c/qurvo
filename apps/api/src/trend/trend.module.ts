import { Module } from '@nestjs/common';
import { TrendService } from './trend.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [TrendService],
  exports: [TrendService],
})
export class TrendModule {}
