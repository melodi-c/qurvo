import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsIn,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { BaseAnalyticsQueryDto } from './shared/base-analytics-query.dto';
import { BaseAnalyticsResponseDto } from './shared/base-analytics-response.dto';

export class RetentionQueryDto extends BaseAnalyticsQueryDto {
  @IsString()
  @IsNotEmpty()
  target_event: string;

  @IsOptional()
  @IsString()
  return_event?: string;

  @ApiProperty({ enum: ['first_time', 'recurring'], enumName: 'RetentionType' })
  @IsIn(['first_time', 'recurring'])
  retention_type: 'first_time' | 'recurring';

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'Granularity' })
  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  periods: number = 11;
}

export class RetentionCohortDto {
  cohort_date: string;
  cohort_size: number;
  periods: number[];
}

export class RetentionResultDto {
  @ApiProperty({ enum: ['first_time', 'recurring'] })
  retention_type: 'first_time' | 'recurring';
  @ApiProperty({ enum: ['day', 'week', 'month'] })
  granularity: 'day' | 'week' | 'month';
  @Type(() => RetentionCohortDto)
  cohorts: RetentionCohortDto[];
  average_retention: number[];
}

export class RetentionResponseDto extends BaseAnalyticsResponseDto {
  @Type(() => RetentionResultDto)
  data: RetentionResultDto;
}
