import { IsString, IsOptional, IsNumber, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PaginatedQueryDto {
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
  @IsIn(['asc', 'desc'])
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  order?: 'asc' | 'desc' = 'desc';
}
