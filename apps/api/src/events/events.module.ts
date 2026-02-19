import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
