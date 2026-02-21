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

export class LifecycleQueryDto {
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

export class LifecycleDataPointDto {
  bucket: string;
  new: number;
  returning: number;
  resurrecting: number;
  dormant: number;
}

export class LifecycleTotalsDto {
  new: number;
  returning: number;
  resurrecting: number;
  dormant: number;
}

export class LifecycleResultDto {
  granularity: string;
  @Type(() => LifecycleDataPointDto)
  data: LifecycleDataPointDto[];
  @Type(() => LifecycleTotalsDto)
  totals: LifecycleTotalsDto;
}

export class LifecycleResponseDto {
  @Type(() => LifecycleResultDto)
  data: LifecycleResultDto;
  cached_at: string;
  from_cache: boolean;
}
