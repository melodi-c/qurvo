import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { randomUUID } from 'crypto';
import { FunnelExclusionDto, FunnelQueryDto } from '../../api/dto/funnel.dto';

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

describe('FunnelQueryDto — breakdown_cohort_ids / breakdown_property mutual exclusion', () => {
  it('accepts when only breakdown_property is provided', async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({ breakdown_property: '$browser' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts when only breakdown_cohort_ids is provided', async () => {
    const errors = await validateFunnelQueryDto(
      minimalFunnelQueryDto({ breakdown_cohort_ids: JSON.stringify([randomUUID()]) }),
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
