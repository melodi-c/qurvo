import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PersonsQueryDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}

export class PersonDto {
  id: string;
  project_id: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  properties: Record<string, unknown>;
  @ApiProperty({ type: [String] })
  distinct_ids: string[];
  created_at: string;
  updated_at: string;
}

export class PersonsListResponseDto {
  persons: PersonDto[];
  total: number;
}

export class PersonEventsQueryDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}

export class PersonEventRowDto {
  event_id: string;
  event_name: string;
  distinct_id: string;
  timestamp: string;
  url: string;
  properties: string;
}
