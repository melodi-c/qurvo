import { ApiProperty } from '@nestjs/swagger';

export class BaseAnalyticsResponseDto {
  @ApiProperty()
  cached_at: string;

  @ApiProperty()
  from_cache: boolean;
}
