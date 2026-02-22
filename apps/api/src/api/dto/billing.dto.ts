import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { PlanFeatures } from '@qurvo/db';

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

  @ApiProperty()
  features: PlanFeatures;

  @ApiProperty({ example: '2026-02-01T00:00:00.000Z' })
  period_start: string;

  @ApiProperty({ example: '2026-03-01T00:00:00.000Z' })
  period_end: string;
}
