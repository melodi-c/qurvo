import { IsString, IsIn, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { notificationChannelTypeEnum, type NotificationChannelType } from '@qurvo/db';

const CHANNEL_TYPES = notificationChannelTypeEnum.enumValues;

export class TestNotificationDto {
  @IsString()
  @IsIn(CHANNEL_TYPES)
  @ApiProperty({ enum: CHANNEL_TYPES })
  channel_type: NotificationChannelType;

  @IsObject()
  @ApiProperty({ type: 'object', additionalProperties: true })
  channel_config: Record<string, unknown>;
}
