import { IsString, IsOptional, MinLength, MaxLength, IsIn, IsUUID, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateOnly, IsDateRange } from './shared/is-date-only.decorator';
import type { AnnotationScope } from '@qurvo/db';

export class CreateAnnotationDto {
  @IsDateOnly()
  date: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  color?: string;

  @IsIn(['project', 'insight'])
  @IsOptional()
  @ApiPropertyOptional({ enum: ['project', 'insight'] })
  scope?: AnnotationScope;

  @IsUUID()
  @ValidateIf((o) => o.scope === 'insight')
  @IsOptional()
  @ApiPropertyOptional()
  insight_id?: string;
}

export class UpdateAnnotationDto {
  @IsDateOnly()
  @IsOptional()
  date?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  label?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  color?: string;

  @IsIn(['project', 'insight'])
  @IsOptional()
  @ApiPropertyOptional({ enum: ['project', 'insight'] })
  scope?: AnnotationScope;

  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional()
  insight_id?: string;
}

export class AnnotationQueryDto {
  @IsDateRange()
  @IsOptional()
  @ApiPropertyOptional()
  date_from?: string;

  @IsDateRange()
  @IsOptional()
  @ApiPropertyOptional()
  date_to?: string;

  @IsUUID()
  @IsOptional()
  @ApiPropertyOptional()
  insight_id?: string;
}

export class AnnotationDto {
  id: string;
  project_id: string;
  created_by: string;
  date: string;
  label: string;
  @ApiPropertyOptional()
  description: string | null;
  @ApiPropertyOptional()
  color: string | null;
  @ApiProperty({ enum: ['project', 'insight'] })
  scope: AnnotationScope;
  @ApiPropertyOptional()
  insight_id: string | null;
  created_at: Date;
  updated_at: Date;
}
