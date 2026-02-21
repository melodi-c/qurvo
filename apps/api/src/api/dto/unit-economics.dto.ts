import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
  IsIn,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

// ── Config DTOs ──────────────────────────────────────────────────────────────

export class UpsertUEConfigDto {
  @IsString()
  @IsOptional()
  purchase_event_name?: string;

  @IsString()
  @IsOptional()
  revenue_property?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  @IsOptional()
  churn_window_days?: number;
}

export class UEConfigDto {
  id: string;
  project_id: string;
  created_by: string;
  purchase_event_name: string | null;
  revenue_property: string;
  currency: string;
  churn_window_days: number;
  created_at: string;
  updated_at: string;
}

// ── Query DTO ────────────────────────────────────────────────────────────────

export class UnitEconomicsQueryDto {
  @IsUUID()
  project_id: string;

  @IsDateString()
  date_from: string;

  @IsDateString()
  date_to: string;

  @ApiProperty({ enum: ['day', 'week', 'month'], enumName: 'Granularity' })
  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month';

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  purchase_event_name?: string;

  @IsString()
  @IsOptional()
  revenue_property?: string;

  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  @IsOptional()
  churn_window_days?: number;

  @IsUUID()
  @IsOptional()
  channel_id?: string;

  @IsString()
  @IsOptional()
  widget_id?: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

// ── Response DTOs ────────────────────────────────────────────────────────────

export class UnitEconomicsMetricsDto {
  ua: number;
  c1: number;
  c2: number;
  apc: number;
  avp: number;
  arppu: number;
  arpu: number;
  churn_rate: number;
  lifetime_periods: number;
  ltv: number;
  cac: number;
  roi_percent: number;
  cm: number;
  total_revenue: number;
  total_purchases: number;
  paying_users: number;
  total_ad_spend: number;
}

export class UEBucketDto {
  bucket: string;
  metrics: UnitEconomicsMetricsDto;
}

export class UEDataDto {
  granularity: string;
  data: UEBucketDto[];
  totals: UnitEconomicsMetricsDto;
}

export class UnitEconomicsResponseDto {
  data: UEDataDto;
  cached_at: string;
  from_cache: boolean;
}
