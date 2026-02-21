import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumberString, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// ── Query DTOs ───────────────────────────────────────────────────────────────

export class AdSpendListQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  channel_id?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date_from?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date_to?: string;
}

export class AdSpendSummaryQueryDto {
  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date_from?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  date_to?: string;
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

export class CreateAdSpendDto {
  @IsString()
  @IsNotEmpty()
  channel_id: string;

  @IsString()
  @IsNotEmpty()
  spend_date: string;

  @IsNumberString()
  amount: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

export class BulkCreateAdSpendDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAdSpendDto)
  items: CreateAdSpendDto[];
}

export class UpdateAdSpendDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  channel_id?: string;

  @IsString()
  @IsOptional()
  spend_date?: string;

  @IsNumberString()
  @IsOptional()
  amount?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

// ── Response DTOs ────────────────────────────────────────────────────────────

export class AdSpendDto {
  id: string;
  project_id: string;
  channel_id: string;
  created_by: string;
  spend_date: string;
  amount: string;
  currency: string;
  @ApiPropertyOptional() note: string | null;
  created_at: string;
  updated_at: string;
}

export class AdSpendSummaryDto {
  channel_id: string;
  channel_name: string;
  @ApiPropertyOptional() channel_color: string | null;
  total_amount: string;
  record_count: number;
}
