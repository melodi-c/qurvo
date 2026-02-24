import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
} from 'class-validator';
import type { FilterOperator } from '../../../utils/property-filter';

export { type FilterOperator };

export class StepFilterDto {
  @IsString()
  @IsNotEmpty()
  property: string;

  @IsIn(['eq', 'neq', 'contains', 'not_contains', 'is_set', 'is_not_set'])
  operator: FilterOperator;

  @IsString()
  @IsOptional()
  value?: string;
}
