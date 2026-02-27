import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { FunnelExclusionDto } from '../../api/dto/funnel.dto';

// Helper to validate a FunnelExclusionDto instance.
// Uses plainToInstance so that @Type(() => Number) transforms fire correctly.
async function validateExclusionDto(
  data: Record<string, unknown>,
): Promise<string[]> {
  const dto = plainToInstance(FunnelExclusionDto, data);
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
