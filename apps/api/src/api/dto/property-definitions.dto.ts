import { IsString, IsOptional, IsBoolean, IsArray, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── Request DTOs ──────────────────────────────────────────────────────────────

export class UpsertPropertyDefinitionDto {
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ApiPropertyOptional({ type: [String] })
  tags?: string[];

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  verified?: boolean;
}

export class PropertyDefinitionQueryDto {
  @IsString()
  @IsOptional()
  @IsIn(['event', 'person'])
  @ApiPropertyOptional({ enum: ['event', 'person'] })
  type?: 'event' | 'person';

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  event_name?: string;
}

// ── Response DTOs ─────────────────────────────────────────────────────────────

export class PropertyDefinitionDto {
  @ApiProperty() property_name: string;
  @ApiProperty({ enum: ['event', 'person'] }) property_type: string;
  @ApiPropertyOptional() value_type: string | null;
  @ApiProperty() is_numerical: boolean;
  @ApiProperty() id: string;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiProperty() verified: boolean;
  @ApiProperty() last_seen_at: string;
  @ApiProperty() updated_at: string;
}

export class UpsertPropertyDefinitionResponseDto {
  id: string;
  project_id: string;
  property_name: string;
  @ApiProperty({ enum: ['event', 'person'] }) property_type: string;
  @ApiPropertyOptional() value_type: string | null;
  @ApiProperty() is_numerical: boolean;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty({ type: [String] }) tags: string[];
  verified: boolean;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}
