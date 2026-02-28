import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsArray,
  Min,
  Max,
  IsIn,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';
import { makeJsonArrayTransform } from './shared/transforms';
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

  @ApiPropertyOptional({ type: [StepFilterDto] })
  @IsOptional()
  @Transform(makeJsonArrayTransform(StepFilterDto))
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];
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
