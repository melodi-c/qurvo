import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsIn,
  IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class StickinessQueryDto {
  @IsUUID()
  project_id: string;

  @IsString()
  @IsNotEmpty()
  target_event: string;

  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';

  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  cohort_ids?: string[];

  @IsUUID()
  @IsOptional()
  widget_id?: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class StickinessDataPointDto {
  period_count: number;
  user_count: number;
}

export class StickinessResultDto {
  granularity: string;
  total_periods: number;
  @Type(() => StickinessDataPointDto)
  data: StickinessDataPointDto[];
}

export class StickinessResponseDto {
  @Type(() => StickinessResultDto)
  data: StickinessResultDto;
  cached_at: string;
  from_cache: boolean;
}
