import { IsString, IsOptional, IsNotEmpty, IsIn, IsObject, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, ApiExtraModels, getSchemaPath } from '@nestjs/swagger';
import { FunnelWidgetConfigDto, TrendWidgetConfigDto, RetentionWidgetConfigDto, LifecycleWidgetConfigDto, StickinessWidgetConfigDto } from './dashboards.dto';

type AnyInsightConfig = FunnelWidgetConfigDto | TrendWidgetConfigDto | RetentionWidgetConfigDto | LifecycleWidgetConfigDto | StickinessWidgetConfigDto;

// ── Create / Update DTOs ──────────────────────────────────────────────────────

@ApiExtraModels(FunnelWidgetConfigDto, TrendWidgetConfigDto, RetentionWidgetConfigDto, LifecycleWidgetConfigDto, StickinessWidgetConfigDto)
export class CreateInsightDto {
  @ApiProperty({ enum: ['trend', 'funnel', 'retention', 'lifecycle', 'stickiness'], enumName: 'InsightType' })
  @IsString()
  @IsIn(['trend', 'funnel', 'retention', 'lifecycle', 'stickiness'])
  type: 'trend' | 'funnel' | 'retention' | 'lifecycle' | 'stickiness';

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
      { $ref: getSchemaPath(LifecycleWidgetConfigDto) },
      { $ref: getSchemaPath(StickinessWidgetConfigDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        funnel: getSchemaPath(FunnelWidgetConfigDto),
        trend: getSchemaPath(TrendWidgetConfigDto),
        retention: getSchemaPath(RetentionWidgetConfigDto),
        lifecycle: getSchemaPath(LifecycleWidgetConfigDto),
        stickiness: getSchemaPath(StickinessWidgetConfigDto),
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
      { $ref: getSchemaPath(LifecycleWidgetConfigDto) },
      { $ref: getSchemaPath(StickinessWidgetConfigDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        funnel: getSchemaPath(FunnelWidgetConfigDto),
        trend: getSchemaPath(TrendWidgetConfigDto),
        retention: getSchemaPath(RetentionWidgetConfigDto),
        lifecycle: getSchemaPath(LifecycleWidgetConfigDto),
        stickiness: getSchemaPath(StickinessWidgetConfigDto),
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

@ApiExtraModels(FunnelWidgetConfigDto, TrendWidgetConfigDto, RetentionWidgetConfigDto, LifecycleWidgetConfigDto, StickinessWidgetConfigDto)
export class InsightDto {
  id: string;
  project_id: string;
  created_by: string;

  @ApiProperty({ enum: ['trend', 'funnel', 'retention', 'lifecycle', 'stickiness'], enumName: 'InsightType' })
  type: 'trend' | 'funnel' | 'retention' | 'lifecycle' | 'stickiness';

  name: string;
  @ApiPropertyOptional() description: string | null;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(FunnelWidgetConfigDto) },
      { $ref: getSchemaPath(TrendWidgetConfigDto) },
      { $ref: getSchemaPath(RetentionWidgetConfigDto) },
      { $ref: getSchemaPath(LifecycleWidgetConfigDto) },
      { $ref: getSchemaPath(StickinessWidgetConfigDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        funnel: getSchemaPath(FunnelWidgetConfigDto),
        trend: getSchemaPath(TrendWidgetConfigDto),
        retention: getSchemaPath(RetentionWidgetConfigDto),
        lifecycle: getSchemaPath(LifecycleWidgetConfigDto),
        stickiness: getSchemaPath(StickinessWidgetConfigDto),
      },
    },
  })
  config: AnyInsightConfig;

  is_favorite: boolean;
  created_at: Date;
  updated_at: Date;
}
