import { IsString, IsOptional, IsNotEmpty, IsIn, IsObject, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { FunnelWidgetConfigDto, TrendWidgetConfigDto, RetentionWidgetConfigDto } from './dashboards.dto';

type AnyInsightConfig = FunnelWidgetConfigDto | TrendWidgetConfigDto | RetentionWidgetConfigDto;

// ── Create / Update DTOs ──────────────────────────────────────────────────────

@ApiExtraModels(FunnelWidgetConfigDto, TrendWidgetConfigDto, RetentionWidgetConfigDto)
export class CreateInsightDto {
  @IsString()
  @IsIn(['trend', 'funnel', 'retention'])
  type: 'trend' | 'funnel' | 'retention';

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
      { $ref: getSchemaPath(RetentionWidgetConfigDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        funnel: getSchemaPath(FunnelWidgetConfigDto),
        trend: getSchemaPath(TrendWidgetConfigDto),
        retention: getSchemaPath(RetentionWidgetConfigDto),
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
      { $ref: getSchemaPath(RetentionWidgetConfigDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        funnel: getSchemaPath(FunnelWidgetConfigDto),
        trend: getSchemaPath(TrendWidgetConfigDto),
        retention: getSchemaPath(RetentionWidgetConfigDto),
      },
    },
  })
  config?: AnyInsightConfig;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  is_favorite?: boolean;
}

// ── Response DTO ─────────────────────────────────────────────────────────────

@ApiExtraModels(FunnelWidgetConfigDto, TrendWidgetConfigDto, RetentionWidgetConfigDto)
export class InsightDto {
  id: string;
  project_id: string;
  created_by: string;

  @ApiProperty({ enum: ['trend', 'funnel', 'retention'] })
  type: 'trend' | 'funnel' | 'retention';

  name: string;
  @ApiPropertyOptional() description: string | null;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(FunnelWidgetConfigDto) },
      { $ref: getSchemaPath(TrendWidgetConfigDto) },
      { $ref: getSchemaPath(RetentionWidgetConfigDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        funnel: getSchemaPath(FunnelWidgetConfigDto),
        trend: getSchemaPath(TrendWidgetConfigDto),
        retention: getSchemaPath(RetentionWidgetConfigDto),
      },
    },
  })
  config: AnyInsightConfig;

  is_favorite: boolean;
  created_at: Date;
  updated_at: Date;
}
