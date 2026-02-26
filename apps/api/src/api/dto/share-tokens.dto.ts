import { IsOptional, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── Request DTOs ─────────────────────────────────────────────────────────────

export class CreateShareTokenDto {
  @IsDateString()
  @IsOptional()
  @ApiPropertyOptional({ description: 'ISO 8601 datetime when the token expires. If omitted, token never expires.' })
  expires_at?: string;
}

// ── Response DTOs ─────────────────────────────────────────────────────────────

export class ShareTokenDto {
  id: string;

  token: string;

  @ApiProperty({ enum: ['dashboard', 'insight'] })
  resource_type: 'dashboard' | 'insight';

  resource_id: string;
  project_id: string;
  created_by: string;

  @ApiPropertyOptional()
  expires_at: Date | null;

  created_at: Date;
}
