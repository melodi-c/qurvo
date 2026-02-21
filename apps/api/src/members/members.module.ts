import { Module } from '@nestjs/common';
import { MembersService } from './members.service';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  providers: [MembersService],
  exports: [MembersService],
})
export class MembersModule {}
