import { Module } from '@nestjs/common';
import { EventDefinitionsService } from './event-definitions.service';
import { PropertyDefinitionsService } from './property-definitions.service';

@Module({
  providers: [EventDefinitionsService, PropertyDefinitionsService],
  exports: [EventDefinitionsService, PropertyDefinitionsService],
})
export class DefinitionsModule {}
