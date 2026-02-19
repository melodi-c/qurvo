import { IsString, IsOptional, MinLength, MaxLength, IsObject, IsIn, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDashboardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}

export class UpdateDashboardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string;
}

export class WidgetLayoutDto {
  @IsNotEmpty()
  x: number;

  @IsNotEmpty()
  y: number;

  @IsNotEmpty()
  w: number;

  @IsNotEmpty()
  h: number;
}

export class CreateWidgetDto {
  @IsString()
  @IsIn(['funnel'])
  type: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsObject()
  config: Record<string, unknown>;

  @IsObject()
  @Type(() => WidgetLayoutDto)
  layout: WidgetLayoutDto;
}

export class UpdateWidgetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  @Type(() => WidgetLayoutDto)
  layout?: WidgetLayoutDto;
}
