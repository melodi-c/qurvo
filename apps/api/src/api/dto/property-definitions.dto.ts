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
  property_name: string;
  @ApiProperty({ enum: ['event', 'person'] }) property_type: string;
  count: number;
  @ApiPropertyOptional() id: string | null;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty({ type: [String] }) tags: string[];
  verified: boolean;
  @ApiPropertyOptional() updated_at: string | null;
}

export class UpsertPropertyDefinitionResponseDto {
  id: string;
  project_id: string;
  property_name: string;
  @ApiProperty({ enum: ['event', 'person'] }) property_type: string;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty({ type: [String] }) tags: string[];
  verified: boolean;
  created_at: Date;
  updated_at: Date;
}
