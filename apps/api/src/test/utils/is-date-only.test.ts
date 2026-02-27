import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { IsDateOnly } from '../../api/dto/shared/is-date-only.decorator';

class TestDto {
  @IsDateOnly()
  date: string;
}

async function isValid(value: unknown): Promise<boolean> {
  const dto = Object.assign(new TestDto(), { date: value });
  const errors = await validate(dto);
  return errors.length === 0;
}

describe('IsDateOnly', () => {
  describe('valid values', () => {
    it('accepts a regular date', async () => {
      expect(await isValid('2024-01-15')).toBe(true);
    });

    it('accepts Feb 29 on a leap year', async () => {
      expect(await isValid('2024-02-29')).toBe(true);
    });

    it('accepts end-of-month dates', async () => {
      expect(await isValid('2024-01-31')).toBe(true);
      expect(await isValid('2024-03-31')).toBe(true);
      expect(await isValid('2024-04-30')).toBe(true);
    });

    it('accepts first day of year', async () => {
      expect(await isValid('2024-01-01')).toBe(true);
    });

    it('accepts last day of year', async () => {
      expect(await isValid('2024-12-31')).toBe(true);
    });
  });

  describe('invalid values — date overflow', () => {
    it('rejects 2024-02-30 (overflows into March)', async () => {
      expect(await isValid('2024-02-30')).toBe(false);
    });

    it('rejects 2024-02-31 (overflows into March)', async () => {
      expect(await isValid('2024-02-31')).toBe(false);
    });

    it('rejects Feb 29 on a non-leap year', async () => {
      expect(await isValid('2023-02-29')).toBe(false);
    });

    it('rejects day 32 in January', async () => {
      expect(await isValid('2024-01-32')).toBe(false);
    });

    it('rejects day 31 in April (30-day month)', async () => {
      expect(await isValid('2024-04-31')).toBe(false);
    });
  });

  describe('invalid values — out-of-range components', () => {
    it('rejects month 99', async () => {
      expect(await isValid('9999-99-99')).toBe(false);
    });

    it('rejects month 00', async () => {
      expect(await isValid('2024-00-01')).toBe(false);
    });

    it('rejects month 13', async () => {
      expect(await isValid('2024-13-01')).toBe(false);
    });

    it('rejects day 00', async () => {
      expect(await isValid('2024-01-00')).toBe(false);
    });
  });

  describe('invalid values — format', () => {
    it('rejects ISO datetime string', async () => {
      expect(await isValid('2024-01-15T00:00:00Z')).toBe(false);
    });

    it('rejects date with time component', async () => {
      expect(await isValid('2024-01-15 00:00:00')).toBe(false);
    });

    it('rejects arbitrary string', async () => {
      expect(await isValid('not-a-date')).toBe(false);
    });

    it('rejects empty string', async () => {
      expect(await isValid('')).toBe(false);
    });

    it('rejects non-string number', async () => {
      expect(await isValid(20240115)).toBe(false);
    });

    it('rejects null', async () => {
      expect(await isValid(null)).toBe(false);
    });
  });
});
