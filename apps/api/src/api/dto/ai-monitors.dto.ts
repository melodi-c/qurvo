import { IsString, IsNumber, IsOptional, IsBoolean, IsObject, IsIn, MinLength, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidChannelConfig } from './shared/is-valid-channel-config.decorator';
import { type NotificationChannelType } from '@qurvo/db';
import { ChannelConfigDto, CHANNEL_TYPES } from './shared/channel-config.dto';

export class CreateMonitorDto extends ChannelConfigDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  event_name: string;

  @IsString()
  @IsIn(['count', 'unique_users'])
  @IsOptional()
  metric?: string;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  threshold_sigma?: number;
}

export class UpdateMonitorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @IsOptional()
  event_name?: string;

  @IsString()
  @IsIn(['count', 'unique_users'])
  @IsOptional()
  metric?: string;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  threshold_sigma?: number;

  @IsString()
  @IsIn(CHANNEL_TYPES)
  @IsOptional()
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

export class AiMonitorDto {
  id: string;
  project_id: string;
  event_name: string;

  @ApiProperty({ enum: ['count', 'unique_users'] })
  metric: 'count' | 'unique_users';

  @ApiProperty({ enum: CHANNEL_TYPES })
  channel_type: NotificationChannelType;

  @ApiProperty({ type: 'object', additionalProperties: true })
  channel_config: Record<string, unknown>;

  threshold_sigma: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
