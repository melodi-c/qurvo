import {
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsOptional,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { parseJsonArray } from './transforms';
import { IsDateOnly } from './is-date-only.decorator';
import { IsIanaTimezone } from './is-iana-timezone.decorator';

export class CoreQueryDto {
  @IsUUID()
  project_id: string;

  @IsDateOnly()
  date_from: string;

  @IsDateOnly()
  date_to: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  force?: boolean;

  @ApiPropertyOptional()
  @IsIanaTimezone()
  @IsOptional()
  timezone?: string;
}

export class BaseAnalyticsQueryDto extends CoreQueryDto {
  @ApiPropertyOptional({ type: [String] })
  @Transform(parseJsonArray)
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  @IsOptional()
  cohort_ids?: string[];

  @IsUUID()
  @IsOptional()
  widget_id?: string;
}
