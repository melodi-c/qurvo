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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { parseJsonArray } from './shared/transforms';

export class LifecycleQueryDto {
  @IsUUID()
  project_id: string;

  @IsString()
  @IsNotEmpty()
  target_event: string;

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'Granularity' })
  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';

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
