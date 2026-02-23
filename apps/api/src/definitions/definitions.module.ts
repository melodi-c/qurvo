import { Module } from '@nestjs/common';
import { EventDefinitionsService } from './event-definitions.service';
import { PropertyDefinitionsService } from './property-definitions.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [EventDefinitionsService, PropertyDefinitionsService],
  exports: [EventDefinitionsService, PropertyDefinitionsService],
})
export class DefinitionsModule {}
