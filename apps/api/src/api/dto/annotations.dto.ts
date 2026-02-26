import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateOnly } from './shared/is-date-only.decorator';

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
}

export class AnnotationQueryDto {
  @IsDateOnly()
  @IsOptional()
  @ApiPropertyOptional()
  date_from?: string;

  @IsDateOnly()
  @IsOptional()
  @ApiPropertyOptional()
  date_to?: string;
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
  created_at: Date;
  updated_at: Date;
}
