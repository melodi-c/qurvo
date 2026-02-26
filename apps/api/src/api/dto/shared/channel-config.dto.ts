import { IsString, IsIn, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { notificationChannelTypeEnum, type NotificationChannelType } from '@qurvo/db';
import { IsValidChannelConfig } from './is-valid-channel-config.decorator';

export const CHANNEL_TYPES = notificationChannelTypeEnum.enumValues;

/**
 * Base DTO carrying the validated channel_type + channel_config fields.
 * Extend this class in any DTO that needs a notification channel.
 */
export class ChannelConfigDto {
  @IsString()
  @IsIn(CHANNEL_TYPES)
  @ApiProperty({ enum: CHANNEL_TYPES })
  channel_type: NotificationChannelType;

  @IsObject()
  @IsValidChannelConfig()
  @ApiProperty({ type: 'object', additionalProperties: true })
  channel_config: Record<string, unknown>;
}
