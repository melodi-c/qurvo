import { describe, it, expect } from 'vitest';
import { validate } from 'class-validator';
import { IsIsoDatetime } from '../../api/dto/shared/is-iso-datetime.decorator';

class TestDto {
  @IsIsoDatetime()
  timestamp: string;
}

async function isValid(value: string): Promise<boolean> {
  const dto = Object.assign(new TestDto(), { timestamp: value });
  const errors = await validate(dto);
  return errors.length === 0;
}

describe('IsIsoDatetime', () => {
  describe('valid values', () => {
    it('accepts plain YYYY-MM-DDTHH:mm:ss', async () => {
      expect(await isValid('2026-02-26T22:14:30')).toBe(true);
    });

    it('accepts datetime with milliseconds', async () => {
      expect(await isValid('2026-02-26T22:14:30.000')).toBe(true);
    });

    it('accepts datetime with Z suffix', async () => {
      expect(await isValid('2026-02-26T22:14:30Z')).toBe(true);
    });

    it('accepts datetime with milliseconds and Z suffix', async () => {
      expect(await isValid('2026-02-26T22:14:30.000Z')).toBe(true);
    });

    it('accepts datetime with positive timezone offset', async () => {
      expect(await isValid('2026-02-26T22:14:30+03:00')).toBe(true);
    });

    it('accepts datetime with negative timezone offset', async () => {
      expect(await isValid('2026-02-26T22:14:30-05:30')).toBe(true);
    });

    it('accepts datetime with milliseconds and positive offset', async () => {
      expect(await isValid('2026-02-26T22:14:30.123+03:00')).toBe(true);
    });

    it('accepts datetime with milliseconds and negative offset', async () => {
      expect(await isValid('2026-02-26T22:14:30.456-05:30')).toBe(true);
    });
  });

  describe('invalid values', () => {
    it('rejects plain date without time', async () => {
      expect(await isValid('2026-02-26')).toBe(false);
    });

    it('rejects date with space separator instead of T', async () => {
      expect(await isValid('2026-02-26 22:14:30')).toBe(false);
    });

    it('rejects datetime without seconds', async () => {
      expect(await isValid('2026-02-26T22:14')).toBe(false);
    });

    it('rejects non-string values', async () => {
      const dto = Object.assign(new TestDto(), { timestamp: 1234567890 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects empty string', async () => {
      expect(await isValid('')).toBe(false);
    });

    it('rejects arbitrary string', async () => {
      expect(await isValid('not-a-date')).toBe(false);
    });
  });
});
