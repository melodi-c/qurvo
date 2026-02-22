import { Module } from '@nestjs/common';
import { EventDefinitionsService } from './event-definitions.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [EventDefinitionsService],
  exports: [EventDefinitionsService],
})
export class EventDefinitionsModule {}
