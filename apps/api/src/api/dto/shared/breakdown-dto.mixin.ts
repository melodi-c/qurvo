import {
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { parseJsonArray } from './transforms';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor = new (...args: any[]) => object;

/**
 * TypeScript mixin that adds breakdown-related DTO fields to any base class.
 *
 * Adds `breakdown_property`, `breakdown_type`, and `breakdown_cohort_ids`
 * with their validation decorators. Class-validator decorators are properly
 * inherited via class inheritance.
 *
 * Usage:
 * ```ts
 * class FunnelQueryDto extends WithBreakdownFields(FunnelBaseQueryDto) { ... }
 * ```
 *
 * Note: class-level validators `@BreakdownMutuallyExclusive()` and
 * `@BreakdownCohortIdsRequiresCohortType()` must still be applied on the
 * concrete DTO class — class-level decorator inheritance is not automatic.
 */
export function WithBreakdownFields<TBase extends Constructor>(Base: TBase) {
  class BreakdownMixin extends Base {
    @IsString()
    @IsNotEmpty()
    @IsOptional()
    breakdown_property?: string;

    @ApiPropertyOptional({ enum: ['property', 'cohort'] })
    @IsIn(['property', 'cohort'])
    @IsOptional()
    breakdown_type?: 'property' | 'cohort';

    @ApiPropertyOptional({ type: [String] })
    @Transform(parseJsonArray)
    @IsArray()
    @ArrayMaxSize(10)
    @ArrayUnique()
    @IsUUID('4', { each: true })
    @IsOptional()
    breakdown_cohort_ids?: string[];
  }
  return BreakdownMixin;
}
