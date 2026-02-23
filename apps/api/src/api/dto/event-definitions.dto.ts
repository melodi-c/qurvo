import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── Request DTOs ──────────────────────────────────────────────────────────────

export class UpsertEventDefinitionDto {
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

// ── Response DTOs ─────────────────────────────────────────────────────────────

export class EventDefinitionDto {
  @ApiProperty() event_name: string;
  @ApiProperty() id: string;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty({ type: [String] }) tags: string[];
  @ApiProperty() verified: boolean;
  @ApiProperty() last_seen_at: string;
  @ApiProperty() updated_at: string;
}

export class UpsertEventDefinitionResponseDto {
  id: string;
  project_id: string;
  event_name: string;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty({ type: [String] }) tags: string[];
  verified: boolean;
  last_seen_at: Date;
  created_at: Date;
  updated_at: Date;
}
