import { IsString, IsOptional, IsBoolean, IsObject, IsIn, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScheduledJobDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsString()
  @MinLength(1)
  prompt: string;

  @IsString()
  @IsIn(['daily', 'weekly', 'monthly'])
  @ApiProperty({ enum: ['daily', 'weekly', 'monthly'] })
  schedule: string;

  @IsString()
  @IsIn(['slack', 'email'])
  @ApiProperty({ enum: ['slack', 'email'] })
  channel_type: string;

  @IsObject()
  @ApiProperty({ type: 'object', additionalProperties: true })
  channel_config: Record<string, unknown>;
}

export class UpdateScheduledJobDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @IsOptional()
  name?: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  prompt?: string;

  @IsString()
  @IsIn(['daily', 'weekly', 'monthly'])
  @IsOptional()
  @ApiPropertyOptional({ enum: ['daily', 'weekly', 'monthly'] })
  schedule?: string;

  @IsString()
  @IsIn(['slack', 'email'])
  @IsOptional()
  @ApiPropertyOptional({ enum: ['slack', 'email'] })
  channel_type?: string;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  channel_config?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class AiScheduledJobDto {
  id: string;
  project_id: string;
  user_id: string;
  name: string;
  prompt: string;

  @ApiProperty({ enum: ['daily', 'weekly', 'monthly'] })
  schedule: string;

  @ApiProperty({ enum: ['slack', 'email'] })
  channel_type: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  channel_config: Record<string, unknown>;

  is_active: boolean;
  last_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
