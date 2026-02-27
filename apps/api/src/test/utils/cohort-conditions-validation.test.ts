import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CohortStoppedPerformingConditionDto,
  CohortRestartedPerformingConditionDto,
  CohortEventFilterDto,
  CohortPropertyConditionDto,
  CohortPerformedRegularlyConditionDto,
  CohortEventConditionDto,
} from '../../api/dto/cohort-conditions.dto';
import {
  CreateCohortDto,
  UpdateCohortDto,
  CreateStaticCohortDto,
  StaticCohortMembersDto,
} from '../../api/dto/cohorts.dto';

// ── stopped_performing ───────────────────────────────────────────────────────

describe('CohortStoppedPerformingConditionDto — window semantics', () => {
  function buildStopped(recent: number, historical: number) {
    return plainToInstance(CohortStoppedPerformingConditionDto, {
      type: 'stopped_performing',
      event_name: 'page_view',
      recent_window_days: recent,
      historical_window_days: historical,
    });
  }

  it('passes when recent < historical', async () => {
    const errors = await validate(buildStopped(7, 30));
    const windowErrors = errors.filter((e) => e.property === 'recent_window_days');
    expect(windowErrors).toHaveLength(0);
  });

  it('fails when recent === historical', async () => {
    const errors = await validate(buildStopped(30, 30));
    const windowErrors = errors.filter((e) => e.property === 'recent_window_days');
    expect(windowErrors.length).toBeGreaterThan(0);
    expect(windowErrors[0].constraints).toMatchObject({
      isLessThan: expect.stringContaining('recent_window_days must be less than historical_window_days'),
    });
  });

  it('fails when recent > historical', async () => {
    const errors = await validate(buildStopped(60, 30));
    const windowErrors = errors.filter((e) => e.property === 'recent_window_days');
    expect(windowErrors.length).toBeGreaterThan(0);
  });

  it('passes with minimal valid values (recent=1, historical=2)', async () => {
    const errors = await validate(buildStopped(1, 2));
    const windowErrors = errors.filter((e) => e.property === 'recent_window_days');
    expect(windowErrors).toHaveLength(0);
  });
});

// ── restarted_performing ─────────────────────────────────────────────────────

describe('CohortRestartedPerformingConditionDto — window semantics', () => {
  function buildRestarted(recent: number, gap: number, historical: number) {
    return plainToInstance(CohortRestartedPerformingConditionDto, {
      type: 'restarted_performing',
      event_name: 'page_view',
      recent_window_days: recent,
      gap_window_days: gap,
      historical_window_days: historical,
    });
  }

  it('passes when historical > recent + gap', async () => {
    const errors = await validate(buildRestarted(7, 14, 30));
    const windowErrors = errors.filter((e) => e.property === 'historical_window_days');
    expect(windowErrors).toHaveLength(0);
  });

  it('fails when historical === recent + gap', async () => {
    // recent=7, gap=14 → historical must be > 21; 21 is invalid
    const errors = await validate(buildRestarted(7, 14, 21));
    const windowErrors = errors.filter((e) => e.property === 'historical_window_days');
    expect(windowErrors.length).toBeGreaterThan(0);
    expect(windowErrors[0].constraints).toMatchObject({
      isGreaterThanSum: expect.stringContaining('historical_window_days must be greater than recent_window_days + gap_window_days'),
    });
  });

  it('fails when historical < recent + gap', async () => {
    // recent=7, gap=14 → sum=21; historical=10 < 21 → invalid
    const errors = await validate(buildRestarted(7, 14, 10));
    const windowErrors = errors.filter((e) => e.property === 'historical_window_days');
    expect(windowErrors.length).toBeGreaterThan(0);
  });

  it('passes with minimal valid values (recent=1, gap=1, historical=3)', async () => {
    const errors = await validate(buildRestarted(1, 1, 3));
    const windowErrors = errors.filter((e) => e.property === 'historical_window_days');
    expect(windowErrors).toHaveLength(0);
  });

  it('fails with equal boundary (recent=1, gap=1, historical=2)', async () => {
    const errors = await validate(buildRestarted(1, 1, 2));
    const windowErrors = errors.filter((e) => e.property === 'historical_window_days');
    expect(windowErrors.length).toBeGreaterThan(0);
  });
});

// ── CohortEventFilterDto — in/not_in/contains_multi/not_contains_multi empty array ──

describe('CohortEventFilterDto — ValuesMinSizeForOperator', () => {
  function buildFilter(operator: string, values: string[] | undefined) {
    return plainToInstance(CohortEventFilterDto, {
      property: 'properties.plan',
      operator,
      values,
    });
  }

  it('passes: in operator with non-empty values', async () => {
    const errors = await validate(buildFilter('in', ['premium']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors).toHaveLength(0);
  });

  it('fails: in operator with empty values array → valuesMinSizeForOperator', async () => {
    const errors = await validate(buildFilter('in', []));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors[0].constraints).toHaveProperty('valuesMinSizeForOperator');
  });

  it('fails: not_in operator with empty values array', async () => {
    const errors = await validate(buildFilter('not_in', []));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors[0].constraints).toHaveProperty('valuesMinSizeForOperator');
  });

  it('fails: contains_multi operator with empty values array', async () => {
    const errors = await validate(buildFilter('contains_multi', []));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors[0].constraints).toHaveProperty('valuesMinSizeForOperator');
  });

  it('fails: not_contains_multi operator with empty values array', async () => {
    const errors = await validate(buildFilter('not_contains_multi', []));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors[0].constraints).toHaveProperty('valuesMinSizeForOperator');
  });

  it('passes: not_in operator with values absent (operator does not require values when omitted)', async () => {
    // values is undefined — @IsOptional passes before custom validator is reached
    const errors = await validate(buildFilter('not_in', undefined));
    // No valuesMinSizeForOperator error expected: @IsOptional skips undefined
    // (the runtime guard in ClickHouse will default to empty array via ?? [])
    // This edge case is intentionally lenient: callers must pass values for in/not_in.
    // The DTO allows omitting for backward compat — the validator only fires when
    // values is an explicit empty array.
    const valErrors = errors.filter(
      (e) => e.property === 'values' && e.constraints?.['valuesMinSizeForOperator'],
    );
    expect(valErrors).toHaveLength(0);
  });

  it('passes: eq operator with values absent — validator skips non-list operators', async () => {
    const errors = await validate(buildFilter('eq', undefined));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors).toHaveLength(0);
  });

  it('passes: in operator with multiple values', async () => {
    const errors = await validate(buildFilter('in', ['a', 'b', 'c']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors).toHaveLength(0);
  });
});

// ── CohortEventFilterDto — between/not_between ordered range ────────────────

describe('CohortEventFilterDto — BetweenValuesOrdered', () => {
  function buildFilter(operator: string, values: string[] | undefined) {
    return plainToInstance(CohortEventFilterDto, {
      property: 'properties.price',
      operator,
      values,
    });
  }

  it('passes: between with ordered range [10, 100]', async () => {
    const errors = await validate(buildFilter('between', ['10', '100']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors).toHaveLength(0);
  });

  it('passes: between with equal bounds [50, 50]', async () => {
    const errors = await validate(buildFilter('between', ['50', '50']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors).toHaveLength(0);
  });

  it('fails: between with reversed range [100, 10] → betweenValuesOrdered', async () => {
    const errors = await validate(buildFilter('between', ['100', '10']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors[0].constraints).toHaveProperty('betweenValuesOrdered');
  });

  it('fails: not_between with reversed range [200, 5]', async () => {
    const errors = await validate(buildFilter('not_between', ['200', '5']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors[0].constraints).toHaveProperty('betweenValuesOrdered');
  });

  it('passes: not_between with ordered range [0, 99]', async () => {
    const errors = await validate(buildFilter('not_between', ['0', '99']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors).toHaveLength(0);
  });

  it('fails: between with only 1 element (not a pair)', async () => {
    const errors = await validate(buildFilter('between', ['10']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors[0].constraints).toHaveProperty('betweenValuesOrdered');
  });

  it('passes: eq operator with values — betweenValuesOrdered skips non-between operators', async () => {
    const errors = await validate(buildFilter('eq', ['10', '5']));
    const valErrors = errors.filter(
      (e) => e.property === 'values' && e.constraints?.['betweenValuesOrdered'],
    );
    expect(valErrors).toHaveLength(0);
  });
});

// ── CohortPerformedRegularlyConditionDto — min_periods ≤ total_periods ───────

describe('CohortPerformedRegularlyConditionDto — min_periods <= total_periods', () => {
  function buildRegularly(minPeriods: number, totalPeriods: number) {
    return plainToInstance(CohortPerformedRegularlyConditionDto, {
      type: 'performed_regularly',
      event_name: 'page_view',
      period_type: 'week',
      total_periods: totalPeriods,
      min_periods: minPeriods,
      time_window_days: 30,
    });
  }

  it('passes when min_periods === total_periods', async () => {
    const errors = await validate(buildRegularly(3, 3));
    const periodErrors = errors.filter((e) => e.property === 'min_periods');
    expect(periodErrors).toHaveLength(0);
  });

  it('passes when min_periods < total_periods', async () => {
    const errors = await validate(buildRegularly(2, 5));
    const periodErrors = errors.filter((e) => e.property === 'min_periods');
    expect(periodErrors).toHaveLength(0);
  });

  it('passes with minimal valid values (min_periods=1, total_periods=1)', async () => {
    const errors = await validate(buildRegularly(1, 1));
    const periodErrors = errors.filter((e) => e.property === 'min_periods');
    expect(periodErrors).toHaveLength(0);
  });

  it('fails when min_periods > total_periods (10 out of 3 is impossible)', async () => {
    const errors = await validate(buildRegularly(10, 3));
    const periodErrors = errors.filter((e) => e.property === 'min_periods');
    expect(periodErrors.length).toBeGreaterThan(0);
    expect(periodErrors[0].constraints).toMatchObject({
      isLessOrEqualTo: expect.stringContaining('min_periods must be'),
    });
  });

  it('fails when min_periods is just 1 over total_periods', async () => {
    const errors = await validate(buildRegularly(4, 3));
    const periodErrors = errors.filter((e) => e.property === 'min_periods');
    expect(periodErrors.length).toBeGreaterThan(0);
  });
});

// ── CohortPropertyConditionDto — same validators ─────────────────────────────

describe('CohortPropertyConditionDto — ValuesMinSizeForOperator + BetweenValuesOrdered', () => {
  function buildCond(operator: string, values: string[] | undefined) {
    return plainToInstance(CohortPropertyConditionDto, {
      type: 'person_property',
      property: 'user_properties.plan',
      operator,
      values,
    });
  }

  it('fails: in with empty values → valuesMinSizeForOperator', async () => {
    const errors = await validate(buildCond('in', []));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors[0].constraints).toHaveProperty('valuesMinSizeForOperator');
  });

  it('fails: between with reversed range → betweenValuesOrdered', async () => {
    const errors = await validate(buildCond('between', ['100', '10']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors.length).toBeGreaterThan(0);
    expect(valErrors[0].constraints).toHaveProperty('betweenValuesOrdered');
  });

  it('passes: in with one element', async () => {
    const errors = await validate(buildCond('in', ['free']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors).toHaveLength(0);
  });

  it('passes: between with [0, 50]', async () => {
    const errors = await validate(buildCond('between', ['0', '50']));
    const valErrors = errors.filter((e) => e.property === 'values');
    expect(valErrors).toHaveLength(0);
  });
});

// ── CohortEventConditionDto — IsInt for count ─────────────────────────────────

describe('CohortEventConditionDto — count must be integer', () => {
  function buildEvent(count: number) {
    return plainToInstance(CohortEventConditionDto, {
      type: 'event',
      event_name: 'page_view',
      count_operator: 'gte',
      count,
      time_window_days: 7,
    });
  }

  it('passes: count is 0 (integer)', async () => {
    const errors = await validate(buildEvent(0));
    const countErrors = errors.filter((e) => e.property === 'count');
    expect(countErrors).toHaveLength(0);
  });

  it('passes: count is positive integer', async () => {
    const errors = await validate(buildEvent(5));
    const countErrors = errors.filter((e) => e.property === 'count');
    expect(countErrors).toHaveLength(0);
  });

  it('fails: count is 1.5 (non-integer)', async () => {
    const errors = await validate(buildEvent(1.5));
    const countErrors = errors.filter((e) => e.property === 'count');
    expect(countErrors.length).toBeGreaterThan(0);
    expect(countErrors[0].constraints).toHaveProperty('isInt');
  });

  it('fails: count is -0.5 (negative non-integer)', async () => {
    const errors = await validate(buildEvent(-0.5));
    const countErrors = errors.filter((e) => e.property === 'count');
    expect(countErrors.length).toBeGreaterThan(0);
  });
});

// ── CohortPerformedRegularlyConditionDto — total_periods Max(365) ─────────────

describe('CohortPerformedRegularlyConditionDto — total_periods max 365', () => {
  function buildRegularly(totalPeriods: number, minPeriods = 1) {
    return plainToInstance(CohortPerformedRegularlyConditionDto, {
      type: 'performed_regularly',
      event_name: 'page_view',
      period_type: 'day',
      total_periods: totalPeriods,
      min_periods: minPeriods,
      time_window_days: 30,
    });
  }

  it('passes: total_periods = 365', async () => {
    const errors = await validate(buildRegularly(365));
    const errors365 = errors.filter((e) => e.property === 'total_periods');
    expect(errors365).toHaveLength(0);
  });

  it('fails: total_periods = 366 (over max)', async () => {
    const errors = await validate(buildRegularly(366));
    const totalErrors = errors.filter((e) => e.property === 'total_periods');
    expect(totalErrors.length).toBeGreaterThan(0);
    expect(totalErrors[0].constraints).toHaveProperty('max');
  });

  it('passes: min_periods = 365 when total_periods = 365', async () => {
    const errors = await validate(buildRegularly(365, 365));
    const periodErrors = errors.filter((e) => e.property === 'min_periods');
    expect(periodErrors).toHaveLength(0);
  });

  it('fails: min_periods = 366 (over max)', async () => {
    const errors = await validate(buildRegularly(400, 366));
    const periodErrors = errors.filter((e) => e.property === 'min_periods');
    expect(periodErrors.length).toBeGreaterThan(0);
    expect(periodErrors[0].constraints).toHaveProperty('max');
  });
});

// ── CreateCohortDto / UpdateCohortDto / CreateStaticCohortDto — MaxLength ─────

describe('CreateCohortDto — name and description MaxLength', () => {
  it('passes: name with 200 chars', async () => {
    const dto = plainToInstance(CreateCohortDto, { name: 'a'.repeat(200) });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'name')).toHaveLength(0);
  });

  it('fails: name with 201 chars → maxLength', async () => {
    const dto = plainToInstance(CreateCohortDto, { name: 'a'.repeat(201) });
    const errors = await validate(dto);
    const nameErrors = errors.filter((e) => e.property === 'name');
    expect(nameErrors.length).toBeGreaterThan(0);
    expect(nameErrors[0].constraints).toHaveProperty('maxLength');
  });

  it('passes: description with 1000 chars', async () => {
    const dto = plainToInstance(CreateCohortDto, { name: 'valid', description: 'a'.repeat(1000) });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'description')).toHaveLength(0);
  });

  it('fails: description with 1001 chars → maxLength', async () => {
    const dto = plainToInstance(CreateCohortDto, { name: 'valid', description: 'a'.repeat(1001) });
    const errors = await validate(dto);
    const descErrors = errors.filter((e) => e.property === 'description');
    expect(descErrors.length).toBeGreaterThan(0);
    expect(descErrors[0].constraints).toHaveProperty('maxLength');
  });
});

describe('UpdateCohortDto — name and description MaxLength', () => {
  it('fails: name with 201 chars → maxLength', async () => {
    const dto = plainToInstance(UpdateCohortDto, { name: 'a'.repeat(201) });
    const errors = await validate(dto);
    const nameErrors = errors.filter((e) => e.property === 'name');
    expect(nameErrors.length).toBeGreaterThan(0);
    expect(nameErrors[0].constraints).toHaveProperty('maxLength');
  });

  it('passes: name absent (optional field)', async () => {
    const dto = plainToInstance(UpdateCohortDto, {});
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'name')).toHaveLength(0);
  });
});

describe('CreateStaticCohortDto — name MaxLength', () => {
  it('fails: name with 201 chars → maxLength', async () => {
    const dto = plainToInstance(CreateStaticCohortDto, { name: 'a'.repeat(201) });
    const errors = await validate(dto);
    const nameErrors = errors.filter((e) => e.property === 'name');
    expect(nameErrors.length).toBeGreaterThan(0);
    expect(nameErrors[0].constraints).toHaveProperty('maxLength');
  });
});

// ── StaticCohortMembersDto — ArrayMaxSize ─────────────────────────────────────

describe('StaticCohortMembersDto — person_ids ArrayMaxSize(10000)', () => {
  const validUuid = '00000000-0000-4000-8000-000000000000';

  it('passes: exactly 10000 person_ids', async () => {
    const dto = plainToInstance(StaticCohortMembersDto, {
      person_ids: Array(10_000).fill(validUuid),
    });
    const errors = await validate(dto);
    expect(errors.filter((e) => e.property === 'person_ids')).toHaveLength(0);
  });

  it('fails: 10001 person_ids → arrayMaxSize', async () => {
    const dto = plainToInstance(StaticCohortMembersDto, {
      person_ids: Array(10_001).fill(validUuid),
    });
    const errors = await validate(dto);
    const idsErrors = errors.filter((e) => e.property === 'person_ids');
    expect(idsErrors.length).toBeGreaterThan(0);
    expect(idsErrors[0].constraints).toHaveProperty('arrayMaxSize');
  });
});
