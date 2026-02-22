import { Module } from '@nestjs/common';
import { PropertyDefinitionsService } from './property-definitions.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [PropertyDefinitionsService],
  exports: [PropertyDefinitionsService],
})
export class PropertyDefinitionsModule {}
