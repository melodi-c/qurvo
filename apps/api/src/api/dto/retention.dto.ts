import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsIn,
  IsArray,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RetentionQueryDto {
  @IsUUID()
  project_id: string;

  @IsString()
  @IsNotEmpty()
  target_event: string;

  @IsIn(['first_time', 'recurring'])
  retention_type: 'first_time' | 'recurring';

  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  periods: number = 11;

  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @ApiPropertyOptional({ type: [String] })
  @Transform(({ value }) => {
    if (!value) return undefined;
    return typeof value === 'string' ? JSON.parse(value) : value;
  })
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

export class RetentionCohortDto {
  cohort_date: string;
  cohort_size: number;
  periods: number[];
}

export class RetentionResultDto {
  retention_type: string;
  granularity: string;
  @Type(() => RetentionCohortDto)
  cohorts: RetentionCohortDto[];
  average_retention: number[];
}

export class RetentionResponseDto {
  @Type(() => RetentionResultDto)
  data: RetentionResultDto;
  cached_at: string;
  from_cache: boolean;
}
