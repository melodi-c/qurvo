import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AiInsightDto {
  id: string;
  project_id: string;
  @ApiProperty({ enum: ['metric_change', 'new_event', 'retention_anomaly', 'conversion_correlation'] })
  type: string;
  title: string;
  description: string;
  @ApiPropertyOptional()
  data_json: unknown;
  created_at: string;
  @ApiPropertyOptional()
  dismissed_at: string | null;
}
