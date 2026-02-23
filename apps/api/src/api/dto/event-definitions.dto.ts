import { IsString, IsOptional, IsBoolean, IsArray, IsIn, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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

export class EventDefinitionsQueryDto {
  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  search?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(500)
  @ApiPropertyOptional({ default: 100 })
  limit?: number = 100;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  @ApiPropertyOptional({ default: 0 })
  offset?: number = 0;

  @IsString()
  @IsOptional()
  @IsIn(['last_seen_at', 'event_name', 'created_at', 'updated_at'])
  @ApiPropertyOptional({ enum: ['last_seen_at', 'event_name', 'created_at', 'updated_at'], default: 'last_seen_at' })
  order_by?: string = 'last_seen_at';

  @IsString()
  @IsOptional()
  @IsIn(['asc', 'desc'])
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  order?: 'asc' | 'desc' = 'desc';
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

export class EventDefinitionsListResponseDto {
  @ApiProperty({ type: [EventDefinitionDto] }) items: EventDefinitionDto[];
  @ApiProperty() total: number;
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
