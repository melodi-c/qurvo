import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProjectRole } from '../../constants';
import { IsIanaTimezone } from './shared/is-iana-timezone.decorator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}

export class UpdateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsString()
  @IsIanaTimezone()
  @IsOptional()
  timezone?: string;
}

export class ProjectDto {
  id: string;
  name: string;
  token: string;
  timezone: string;
  plan: string | null;
  is_demo: boolean;
  created_at: Date;
  updated_at: Date;
}

export class ProjectWithRoleDto extends ProjectDto {
  @ApiProperty({ enum: ['owner', 'editor', 'viewer'] })
  role: ProjectRole;
}

export class RotateTokenResponseDto extends ProjectDto {}
