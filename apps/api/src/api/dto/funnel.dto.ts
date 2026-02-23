import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
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
} from 'class-validator';
import { Type, Transform, plainToInstance } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { StepFilterDto } from './shared/filters.dto';

export class FunnelStepDto {
  @IsString()
  @IsNotEmpty()
  event_name: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => StepFilterDto)
  filters?: StepFilterDto[];
}

export class FunnelQueryDto {
  @IsUUID()
  project_id: string;

  @Transform(({ value }) => {
    if (!value) return undefined;
    const arr = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(arr) ? plainToInstance(FunnelStepDto, arr) : arr;
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => FunnelStepDto)
  steps: FunnelStepDto[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  conversion_window_days: number = 14;

  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @IsString()
  @IsOptional()
  breakdown_property?: string;

  @ApiPropertyOptional({ enum: ['property', 'cohort'] })
  @IsOptional()
  breakdown_type?: 'property' | 'cohort';

  @ApiPropertyOptional({ type: [String] })
  @Transform(({ value }) => {
    if (!value) return undefined;
    return typeof value === 'string' ? JSON.parse(value) : value;
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  breakdown_cohort_ids?: string[];

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

// breakdown_value присутствует только у breakdown-шагов, поэтому optional
export class FunnelStepResultDto {
  step: number;
  label: string;
  event_name: string;
  count: number;
  conversion_rate: number;
  drop_off: number;
  drop_off_rate: number;
  avg_time_to_convert_seconds: number | null;
  @ApiPropertyOptional() breakdown_value?: string;
}

export class FunnelResultDto {
  breakdown: boolean;
  @ApiPropertyOptional() breakdown_property?: string;
  @Type(() => FunnelStepResultDto)
  steps: FunnelStepResultDto[];
  @ApiPropertyOptional()
  @Type(() => FunnelStepResultDto)
  aggregate_steps?: FunnelStepResultDto[];
}

export class FunnelResponseDto {
  @Type(() => FunnelResultDto)
  data: FunnelResultDto;
  cached_at: string;
  from_cache: boolean;
}
