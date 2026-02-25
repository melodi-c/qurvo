import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}

export class ProjectDto {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
  created_at: Date;
  updated_at: Date;
}

export class ProjectWithRoleDto extends ProjectDto {
  @ApiProperty({ enum: ['owner', 'editor', 'viewer'] })
  role: 'owner' | 'editor' | 'viewer';
}
