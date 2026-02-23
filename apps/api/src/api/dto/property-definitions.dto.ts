import { IsString, IsOptional, IsBoolean, IsArray, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PaginatedQueryDto } from './shared/paginated-query.dto';

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

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  value_type?: string;

  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  is_numerical?: boolean;
}

export class PropertyDefinitionQueryDto extends PaginatedQueryDto {
  @IsString()
  @IsOptional()
  @IsIn(['event', 'person'])
  @ApiPropertyOptional({ enum: ['event', 'person'] })
  type?: 'event' | 'person';

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  event_name?: string;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  @ApiPropertyOptional()
  is_numerical?: boolean;

  @IsString()
  @IsOptional()
  @IsIn(['last_seen_at', 'property_name', 'created_at', 'updated_at'])
  @ApiPropertyOptional({ enum: ['last_seen_at', 'property_name', 'created_at', 'updated_at'], default: 'last_seen_at' })
  order_by?: string = 'last_seen_at';
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

export class PropertyDefinitionsListResponseDto {
  @ApiProperty({ type: [PropertyDefinitionDto] }) items: PropertyDefinitionDto[];
  @ApiProperty() total: number;
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
