import { IsString, IsNotEmpty, IsOptional, IsIn, IsArray, ValidateNested } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ── Filter Condition ────────────────────────────────────────────────────────

export class FilterConditionDto {
  @IsString()
  @IsNotEmpty()
  property: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

export class CreateMarketingChannelDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['manual', 'google_ads', 'facebook_ads', 'tiktok_ads', 'custom_api'])
  @IsOptional()
  channel_type?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterConditionDto)
  filter_conditions?: FilterConditionDto[];

  @IsString()
  @IsOptional()
  color?: string;
}

export class UpdateMarketingChannelDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsIn(['manual', 'google_ads', 'facebook_ads', 'tiktok_ads', 'custom_api'])
  @IsOptional()
  channel_type?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterConditionDto)
  filter_conditions?: FilterConditionDto[];

  @IsString()
  @IsOptional()
  color?: string;
}

// ── Response DTOs ────────────────────────────────────────────────────────────

export class MarketingChannelDto {
  id: string;
  project_id: string;
  created_by: string;
  name: string;
  channel_type: string;
  @ApiPropertyOptional() integration_config: unknown;
  @ApiPropertyOptional({ type: [FilterConditionDto] }) filter_conditions: FilterConditionDto[] | null;
  @ApiPropertyOptional() color: string | null;
  created_at: string;
  updated_at: string;
}
