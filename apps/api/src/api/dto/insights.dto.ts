import { IsString, IsOptional, IsNotEmpty, IsIn, IsObject, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { FunnelWidgetConfigDto, TrendWidgetConfigDto } from './dashboards.dto';

type AnyInsightConfig = FunnelWidgetConfigDto | TrendWidgetConfigDto;

// ── Create / Update DTOs ──────────────────────────────────────────────────────

@ApiExtraModels(FunnelWidgetConfigDto, TrendWidgetConfigDto)
export class CreateInsightDto {
  @IsString()
  @IsIn(['trend', 'funnel'])
  type: 'trend' | 'funnel';

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsObject()
  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(FunnelWidgetConfigDto) },
      { $ref: getSchemaPath(TrendWidgetConfigDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        funnel: getSchemaPath(FunnelWidgetConfigDto),
        trend: getSchemaPath(TrendWidgetConfigDto),
      },
    },
  })
  config: AnyInsightConfig;
}

export class UpdateInsightDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsObject()
  @IsOptional()
  @ApiPropertyOptional({
    oneOf: [
      { $ref: getSchemaPath(FunnelWidgetConfigDto) },
      { $ref: getSchemaPath(TrendWidgetConfigDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        funnel: getSchemaPath(FunnelWidgetConfigDto),
        trend: getSchemaPath(TrendWidgetConfigDto),
      },
    },
  })
  config?: AnyInsightConfig;
}

// ── Response DTO ─────────────────────────────────────────────────────────────

@ApiExtraModels(FunnelWidgetConfigDto, TrendWidgetConfigDto)
export class InsightDto {
  id: string;
  project_id: string;
  created_by: string;

  @ApiProperty({ enum: ['trend', 'funnel'] })
  type: 'trend' | 'funnel';

  name: string;
  @ApiPropertyOptional() description: string | null;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(FunnelWidgetConfigDto) },
      { $ref: getSchemaPath(TrendWidgetConfigDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        funnel: getSchemaPath(FunnelWidgetConfigDto),
        trend: getSchemaPath(TrendWidgetConfigDto),
      },
    },
  })
  config: AnyInsightConfig;

  created_at: Date;
  updated_at: Date;
}
