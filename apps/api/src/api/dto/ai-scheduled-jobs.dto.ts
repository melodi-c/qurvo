import { IsString, IsOptional, IsBoolean, IsObject, IsIn, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidChannelConfig } from './shared/is-valid-channel-config.decorator';
import { type NotificationChannelType } from '@qurvo/db';
import { ChannelConfigDto, CHANNEL_TYPES } from './shared/channel-config.dto';

export class CreateScheduledJobDto extends ChannelConfigDto {
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
  @IsIn(CHANNEL_TYPES)
  @IsOptional()
  @ApiPropertyOptional({ enum: CHANNEL_TYPES })
  channel_type?: NotificationChannelType;

  @IsObject()
  @IsValidChannelConfig()
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

  @ApiProperty({ enum: CHANNEL_TYPES })
  channel_type: NotificationChannelType;

  @ApiProperty({ type: 'object', additionalProperties: true })
  channel_config: Record<string, unknown>;

  is_active: boolean;
  last_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
