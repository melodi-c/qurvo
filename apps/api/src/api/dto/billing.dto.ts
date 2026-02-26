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

export class BillingStatusDto {
  @ApiProperty({ example: 'free' })
  plan: string;

  @ApiProperty({ example: 'Free' })
  plan_name: string;

  @ApiProperty({ example: 42130 })
  events_this_month: number;

  @ApiPropertyOptional({ example: null, nullable: true })
  events_limit: number | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  data_retention_days: number | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  max_projects: number | null;

  @ApiPropertyOptional({ example: 50, nullable: true })
  ai_messages_per_month: number | null;

  @ApiProperty({ example: 0 })
  ai_messages_used: number;

  @ApiProperty({ type: PlanFeaturesDto })
  features: PlanFeaturesDto;

  @ApiProperty({ example: '2026-02-01T00:00:00.000Z' })
  period_start: string;

  @ApiProperty({ example: '2026-03-01T00:00:00.000Z' })
  period_end: string;
}
