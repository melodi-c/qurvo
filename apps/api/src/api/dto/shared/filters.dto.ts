import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsArray,
} from 'class-validator';
import type { FilterOperator } from '../../../analytics/query-helpers';

const ALL_FILTER_OPERATORS: FilterOperator[] = [
  'eq', 'neq',
  'contains', 'not_contains',
  'is_set', 'is_not_set',
  'gt', 'lt', 'gte', 'lte',
  'regex', 'not_regex',
  'in', 'not_in',
  'between', 'not_between',
  'is_date_before', 'is_date_after', 'is_date_exact',
  'contains_multi', 'not_contains_multi',
];

export class StepFilterDto {
  @IsString()
  @IsNotEmpty()
  property: string;

  @IsIn(ALL_FILTER_OPERATORS)
  operator: FilterOperator;

  @IsString()
  @IsOptional()
  value?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  values?: string[];
}
