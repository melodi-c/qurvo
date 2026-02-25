import { IsUUID, IsInt, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class IngestionWarningsQueryDto {
  @IsUUID()
  project_id: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  @IsOptional()
  limit?: number = 50;
}

export class IngestionWarningDto {
  @ApiProperty()
  project_id: string;

  @ApiProperty()
  type: string;

  @ApiProperty()
  details: string;

  @ApiProperty()
  timestamp: string;
}
