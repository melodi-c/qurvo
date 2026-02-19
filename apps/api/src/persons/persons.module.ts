import { Module } from '@nestjs/common';
import { PersonsService } from './persons.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [PersonsService],
  exports: [PersonsService],
})
export class PersonsModule {}
