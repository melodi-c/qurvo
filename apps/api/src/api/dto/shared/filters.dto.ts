import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
} from 'class-validator';

export type FilterOperator = 'eq' | 'neq' | 'contains' | 'not_contains' | 'is_set' | 'is_not_set';

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
