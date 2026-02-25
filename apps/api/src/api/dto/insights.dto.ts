import { IsString, IsOptional, IsNotEmpty, IsIn, IsObject, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { FunnelWidgetConfigDto, TrendWidgetConfigDto, RetentionWidgetConfigDto, LifecycleWidgetConfigDto, StickinessWidgetConfigDto, PathsWidgetConfigDto } from './dashboards.dto';

type AnyInsightConfig = FunnelWidgetConfigDto | TrendWidgetConfigDto | RetentionWidgetConfigDto | LifecycleWidgetConfigDto | StickinessWidgetConfigDto | PathsWidgetConfigDto;

function insightConfigSchema() {
  return {
    oneOf: [
      { $ref: getSchemaPath(FunnelWidgetConfigDto) },
      { $ref: getSchemaPath(TrendWidgetConfigDto) },
      { $ref: getSchemaPath(RetentionWidgetConfigDto) },
      { $ref: getSchemaPath(LifecycleWidgetConfigDto) },
      { $ref: getSchemaPath(StickinessWidgetConfigDto) },
      { $ref: getSchemaPath(PathsWidgetConfigDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        funnel: getSchemaPath(FunnelWidgetConfigDto),
        trend: getSchemaPath(TrendWidgetConfigDto),
        retention: getSchemaPath(RetentionWidgetConfigDto),
        lifecycle: getSchemaPath(LifecycleWidgetConfigDto),
        stickiness: getSchemaPath(StickinessWidgetConfigDto),
        paths: getSchemaPath(PathsWidgetConfigDto),
      },
    },
  };
}

// ── Query DTOs ──────────────────────────────────────────────────────────────

export class ListInsightsQueryDto {
  @ApiPropertyOptional({ enum: ['trend', 'funnel', 'retention', 'lifecycle', 'stickiness', 'paths'] })
  @IsOptional()
  @IsIn(['trend', 'funnel', 'retention', 'lifecycle', 'stickiness', 'paths'])
  type?: 'trend' | 'funnel' | 'retention' | 'lifecycle' | 'stickiness' | 'paths';
}

// ── Create / Update DTOs ──────────────────────────────────────────────────────

@ApiExtraModels(FunnelWidgetConfigDto, TrendWidgetConfigDto, RetentionWidgetConfigDto, LifecycleWidgetConfigDto, StickinessWidgetConfigDto, PathsWidgetConfigDto)
export class CreateInsightDto {
  @ApiProperty({ enum: ['trend', 'funnel', 'retention', 'lifecycle', 'stickiness', 'paths'], enumName: 'InsightType' })
  @IsString()
  @IsIn(['trend', 'funnel', 'retention', 'lifecycle', 'stickiness', 'paths'])
  type: 'trend' | 'funnel' | 'retention' | 'lifecycle' | 'stickiness' | 'paths';

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsObject()
  @ApiProperty(insightConfigSchema())
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
  @ApiPropertyOptional(insightConfigSchema())
  config?: AnyInsightConfig;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  is_favorite?: boolean;
}

// ── Response DTO ─────────────────────────────────────────────────────────────

@ApiExtraModels(FunnelWidgetConfigDto, TrendWidgetConfigDto, RetentionWidgetConfigDto, LifecycleWidgetConfigDto, StickinessWidgetConfigDto, PathsWidgetConfigDto)
export class InsightDto {
  id: string;
  project_id: string;
  created_by: string;

  @ApiProperty({ enum: ['trend', 'funnel', 'retention', 'lifecycle', 'stickiness', 'paths'], enumName: 'InsightType' })
  type: 'trend' | 'funnel' | 'retention' | 'lifecycle' | 'stickiness' | 'paths';

  name: string;
  @ApiPropertyOptional() description: string | null;

  @ApiProperty(insightConfigSchema())
  config: AnyInsightConfig;

  is_favorite: boolean;
  created_at: Date;
  updated_at: Date;
}
