import { IsString, IsIn, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TestNotificationDto {
  @IsString()
  @IsIn(['slack', 'email', 'telegram'])
  @ApiProperty({ enum: ['slack', 'email', 'telegram'] })
  channel_type: string;

  @IsObject()
  @ApiProperty({ type: 'object', additionalProperties: true })
  channel_config: Record<string, unknown>;
}

export class TestNotificationResponseDto {
  @ApiProperty()
  ok: boolean;
}
