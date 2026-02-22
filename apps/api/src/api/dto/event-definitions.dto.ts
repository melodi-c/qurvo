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
  event_name: string;
  count: number;
  @ApiPropertyOptional() id: string | null;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty({ type: [String] }) tags: string[];
  verified: boolean;
  @ApiPropertyOptional() updated_at: string | null;
}

export class UpsertEventDefinitionResponseDto {
  id: string;
  project_id: string;
  event_name: string;
  @ApiPropertyOptional() description: string | null;
  @ApiProperty({ type: [String] }) tags: string[];
  verified: boolean;
  created_at: Date;
  updated_at: Date;
}
