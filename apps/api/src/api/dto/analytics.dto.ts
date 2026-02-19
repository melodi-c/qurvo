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
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export type FilterOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';

export class StepFilterDto {
  @IsString()
  @IsNotEmpty()
  property: string;

  @IsIn(['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_not_set'])
  operator: FilterOperator;

  @IsString()
  @IsOptional()
  value?: string;
}

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

  @IsUUID()
  @IsOptional()
  widget_id?: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

export class FunnelStepResultDto {
  step: number;
  label: string;
  event_name: string;
  count: number;
  conversion_rate: number;
  drop_off: number;
  drop_off_rate: number;
  avg_time_to_convert_seconds: number | null;
}

export class FunnelBreakdownStepResultDto extends FunnelStepResultDto {
  breakdown_value: string;
}

export class FunnelResultDto {
  breakdown: boolean;
  breakdown_property?: string;
  steps: FunnelStepResultDto[] | FunnelBreakdownStepResultDto[];
}

export class FunnelResponseDto {
  data: FunnelResultDto;
  cached_at: string;
  from_cache: boolean;
}

export class EventsQueryDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  event_name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  distinct_id?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date_from?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date_to?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}

export class EventRowDto {
  event_id: string;
  event_name: string;
  distinct_id: string;
  timestamp: string;
  url: string;
  properties: string;
}

export class EventNamesQueryDto {
  @IsUUID()
  project_id: string;
}

export class EventNamesResponseDto {
  event_names: string[];
}
