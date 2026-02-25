import { IsString, IsBoolean, IsInt, IsOptional, IsNumber, Min, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlanFeaturesDto {
  @ApiProperty({ example: true })
  cohorts: boolean;

  @ApiProperty({ example: true })
  lifecycle: boolean;

  @ApiProperty({ example: true })
  stickiness: boolean;

  @ApiProperty({ example: true })
  api_export: boolean;

  @ApiProperty({ example: true })
  ai_insights: boolean;
}

export class AdminPlanDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'free' })
  slug: string;

  @ApiProperty({ example: 'Free' })
  name: string;

  @ApiPropertyOptional({ example: 1000000, nullable: true })
  events_limit: number | null;

  @ApiPropertyOptional({ example: 30, nullable: true })
  data_retention_days: number | null;

  @ApiPropertyOptional({ example: 3, nullable: true })
  max_projects: number | null;

  @ApiPropertyOptional({ example: 50, nullable: true })
  ai_messages_per_month: number | null;

  @ApiProperty({ type: PlanFeaturesDto })
  features: PlanFeaturesDto;

  @ApiProperty({ example: true })
  is_public: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  created_at: string;
}

export class CreatePlanFeaturesDto {
  @IsBoolean()
  cohorts: boolean;

  @IsBoolean()
  lifecycle: boolean;

  @IsBoolean()
  stickiness: boolean;

  @IsBoolean()
  api_export: boolean;

  @IsBoolean()
  ai_insights: boolean;
}

export class CreateAdminPlanDto {
  @IsString()
  @MaxLength(50)
  slug: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  events_limit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  data_retention_days?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_projects?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  ai_messages_per_month?: number | null;

  @ValidateNested()
  @Type(() => CreatePlanFeaturesDto)
  features: CreatePlanFeaturesDto;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;
}

export class PatchAdminPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  events_limit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  data_retention_days?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  max_projects?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  ai_messages_per_month?: number | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePlanFeaturesDto)
  features?: CreatePlanFeaturesDto;

  @IsOptional()
  @IsBoolean()
  is_public?: boolean;
}
