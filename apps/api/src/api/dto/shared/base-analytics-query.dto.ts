import {
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { parseJsonArray } from './transforms';

export class BaseAnalyticsQueryDto {
  @IsUUID()
  project_id: string;

  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @ApiPropertyOptional({ type: [String] })
  @Transform(parseJsonArray)
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
