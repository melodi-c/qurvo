import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'crypto';
import {
  FunnelExclusionDto,
  FunnelQueryDto,
  FunnelStepDto,
  FunnelTimeToConvertQueryDto,
} from '../../api/dto/funnel.dto';

// Helper to validate a FunnelExclusionDto instance.
// Uses plainToInstance so that @Type(() => Number) transforms fire correctly.
async function validateExclusionDto(
  data: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(FunnelExclusionDto, data);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

// Minimal valid FunnelQueryDto payload (without breakdown fields).
function minimalFunnelQueryDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project_id: randomUUID(),
    date_from: '2024-01-01',
    date_to: '2024-01-31',
    steps: [
      { event_name: 'signup', label: 'Sign up' },
      { event_name: 'purchase', label: 'Purchase' },
    ],
    ...overrides,
  };
}

async function validateFunnelQueryDto(data: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(FunnelQueryDto, data);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('FunnelExclusionDto — @Max(9) constraint', () => {
  it('accepts funnel_from_step = 0 and funnel_to_step = 1 (minimum valid values)', async () => {
    const errors = await validateExclusionDto({
      event_name: 'cancel',
      funnel_from_step: 0,
      funnel_to_step: 1,
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts funnel_from_step = 8 and funnel_to_step = 9 (maximum valid values)', async () => {
    const errors = await validateExclusionDto({
      event_name: 'cancel',
      funnel_from_step: 8,
      funnel_to_step: 9,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects funnel_from_step = 10 (exceeds @Max(9))', async () => {
    const errors = await validateExclusionDto({
      event_name: 'cancel',
      funnel_from_step: 10,
      funnel_to_step: 11,
    });
    // Both fields exceed max — at least funnel_from_step should fail
    expect(errors.some((msg) => msg.includes('funnel_from_step'))).toBe(true);
  });

  it('rejects funnel_to_step = 10 (exceeds @Max(9))', async () => {
    const errors = await validateExclusionDto({
      event_name: 'cancel',
      funnel_from_step: 0,
      funnel_to_step: 10,
    });
    expect(errors.some((msg) => msg.includes('funnel_to_step'))).toBe(true);
  });

  it('rejects funnel_to_step = 9 when funnel_from_step = 9 (same, but from_step must be < to_step — enforced at service level)', async () => {
    // DTO only checks @Max(9); business logic (from < to) is in validateExclusions()
    const errors = await validateExclusionDto({
      event_name: 'cancel',
      funnel_from_step: 9,
      funnel_to_step: 9,
    });
    // Both 9, which passes @Max(9) — DTO-level validation alone does not catch from >= to
    expect(errors).toHaveLength(0);
  });
});

describe('FunnelQueryDto — conversion_window_value @Max(365) constraint', () => {
  it('accepts conversion_window_value = 1 with unit (minimum valid value)', async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({ conversion_window_value: 1, conversion_window_unit: 'day' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts conversion_window_value = 365 (boundary maximum)', async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({ conversion_window_value: 365, conversion_window_unit: 'second' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects conversion_window_value = 366 (exceeds @Max(365))', async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({ conversion_window_value: 366, conversion_window_unit: 'day' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects conversion_window_value = 999999 (the reported attack vector)', async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({ conversion_window_value: 999999, conversion_window_unit: 'day' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects conversion_window_value = 0 (below @Min(1))', async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({ conversion_window_value: 0, conversion_window_unit: 'day' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('FunnelQueryDto — breakdown_cohort_ids / breakdown_property mutual exclusion', () => {
  it('accepts when only breakdown_property is provided', async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({ breakdown_property: '$browser' }),
    );
    expect(errors).toHaveLength(0);
  });

  it("accepts when only breakdown_cohort_ids is provided together with breakdown_type='cohort'", async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({
        breakdown_cohort_ids: JSON.stringify([randomUUID()]),
        breakdown_type: 'cohort',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts when neither breakdown field is provided', async () => {
    const errors = await validateFunnelQueryDto(minimalFunnelQueryDto());
    expect(errors).toHaveLength(0);
  });

  it('rejects when both breakdown_cohort_ids and breakdown_property are provided', async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({
        breakdown_cohort_ids: JSON.stringify([randomUUID()]),
        breakdown_property: '$browser',
      }),
    );
    expect(
      errors.some((msg) => msg.includes('один тип breakdown')),
    ).toBe(true);
  });

  it('accepts when breakdown_cohort_ids is an empty array (treated as absent)', async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({
        breakdown_cohort_ids: JSON.stringify([]),
        breakdown_property: '$browser',
      }),
    );
    // Empty cohort_ids array does not conflict with breakdown_property
    expect(errors).toHaveLength(0);
  });
});

// ── FunnelStepDto — @IsNotEmpty({ each: true }) on event_names ────────────────

async function validateStepDto(data: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(FunnelStepDto, data);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('FunnelStepDto — @IsNotEmpty({ each: true }) on event_names', () => {
  it('accepts event_names with non-empty strings', async () => {
    const errors = await validateStepDto({
      event_name: 'signup',
      label: 'Sign up',
      event_names: ['signup', 'register'],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects event_names containing an empty string', async () => {
    const errors = await validateStepDto({
      event_name: 'signup',
      label: 'Sign up',
      event_names: [''],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects event_names with a mix of valid and empty strings', async () => {
    const errors = await validateStepDto({
      event_name: 'signup',
      label: 'Sign up',
      event_names: ['signup', ''],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts when event_names is absent (optional field)', async () => {
    const errors = await validateStepDto({
      event_name: 'signup',
      label: 'Sign up',
    });
    expect(errors).toHaveLength(0);
  });
});

// ── FunnelStepDto — @ArrayMaxSize(20) on filters ─────────────────────────────

describe('FunnelStepDto — @ArrayMaxSize(20) on filters', () => {
  it('accepts filters with exactly 20 entries', async () => {
    const filters = Array.from({ length: 20 }, (_, i) => ({
      property: `properties.p${i}`,
      operator: 'eq',
      value: 'v',
    }));
    const errors = await validateStepDto({
      event_name: 'click',
      label: 'Click',
      filters,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects filters with 21 entries (exceeds @ArrayMaxSize(20))', async () => {
    const filters = Array.from({ length: 21 }, (_, i) => ({
      property: `properties.p${i}`,
      operator: 'eq',
      value: 'v',
    }));
    const errors = await validateStepDto({
      event_name: 'click',
      label: 'Click',
      filters,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects filters with 100 entries (the reported attack vector)', async () => {
    const filters = Array.from({ length: 100 }, (_, i) => ({
      property: `properties.p${i}`,
      operator: 'eq',
      value: 'v',
    }));
    const errors = await validateStepDto({
      event_name: 'click',
      label: 'Click',
      filters,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts when filters is absent (optional field)', async () => {
    const errors = await validateStepDto({
      event_name: 'click',
      label: 'Click',
    });
    expect(errors).toHaveLength(0);
  });
});

// ── FunnelQueryDto — @ArrayMaxSize(5) on exclusions ──────────────────────────

describe('FunnelQueryDto — @ArrayMaxSize(5) on exclusions', () => {
  it('accepts exclusions with exactly 5 entries', async () => {
    const exclusions = Array.from({ length: 5 }, (_, i) => ({
      event_name: `cancel_${i}`,
      funnel_from_step: 0,
      funnel_to_step: 1,
    }));
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({ exclusions: JSON.stringify(exclusions) }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects exclusions with 6 entries (exceeds @ArrayMaxSize(5))', async () => {
    const exclusions = Array.from({ length: 6 }, (_, i) => ({
      event_name: `cancel_${i}`,
      funnel_from_step: 0,
      funnel_to_step: 1,
    }));
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({ exclusions: JSON.stringify(exclusions) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ── FunnelQueryDto — breakdown_cohort_ids requires breakdown_type='cohort' ────

describe("FunnelQueryDto — breakdown_cohort_ids requires breakdown_type='cohort'", () => {
  it("accepts when breakdown_cohort_ids provided with breakdown_type='cohort'", async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({
        breakdown_cohort_ids: JSON.stringify([randomUUID()]),
        breakdown_type: 'cohort',
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts when breakdown_cohort_ids is absent (no breakdown_type required)', async () => {
    const errors = await validateFunnelQueryDto(minimalFunnelQueryDto());
    expect(errors).toHaveLength(0);
  });

  it("rejects when breakdown_cohort_ids provided without breakdown_type (missing)", async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({
        breakdown_cohort_ids: JSON.stringify([randomUUID()]),
      }),
    );
    expect(
      errors.some((msg) => msg.includes('breakdown_type')),
    ).toBe(true);
  });

  it("rejects when breakdown_cohort_ids provided with breakdown_type='property'", async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({
        breakdown_cohort_ids: JSON.stringify([randomUUID()]),
        breakdown_type: 'property',
      }),
    );
    expect(
      errors.some((msg) => msg.includes('breakdown_type')),
    ).toBe(true);
  });

  it("accepts when breakdown_cohort_ids is an empty array (no type constraint needed)", async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({
        breakdown_cohort_ids: JSON.stringify([]),
      }),
    );
    expect(errors).toHaveLength(0);
  });
});

// ── FunnelTimeToConvertQueryDto — @ArrayMaxSize(5) on exclusions ──────────────

async function validateFunnelTtcDto(data: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(FunnelTimeToConvertQueryDto, data);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

function minimalFunnelTtcDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    project_id: randomUUID(),
    date_from: '2024-01-01',
    date_to: '2024-01-31',
    steps: [
      { event_name: 'signup', label: 'Sign up' },
      { event_name: 'purchase', label: 'Purchase' },
    ],
    from_step: 0,
    to_step: 1,
    ...overrides,
  };
}

describe('FunnelTimeToConvertQueryDto — @ArrayMaxSize(5) on exclusions', () => {
  it('accepts exclusions with exactly 5 entries', async () => {
    const exclusions = Array.from({ length: 5 }, (_, i) => ({
      event_name: `cancel_${i}`,
      funnel_from_step: 0,
      funnel_to_step: 1,
    }));
    const errors = await validateFunnelTtcDto(
      minimalFunnelTtcDto({ exclusions: JSON.stringify(exclusions) }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects exclusions with 6 entries (exceeds @ArrayMaxSize(5))', async () => {
    const exclusions = Array.from({ length: 6 }, (_, i) => ({
      event_name: `cancel_${i}`,
      funnel_from_step: 0,
      funnel_to_step: 1,
    }));
    const errors = await validateFunnelTtcDto(
      minimalFunnelTtcDto({ exclusions: JSON.stringify(exclusions) }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});
