import { describe, it, expect } from 'vitest';
import { parseCohortCsv } from '../../cohorts/parse-cohort-csv';
import { AppBadRequestException } from '../../exceptions/app-bad-request.exception';

describe('parseCohortCsv — header detection', () => {
  it('detects "person_id" header and skips it from ids', () => {
    const csv = 'person_id\nabc-123\ndef-456';
    const result = parseCohortCsv(csv);
    expect(result.idType).toBe('distinct_id');
    expect(result.ids).toEqual(['abc-123', 'def-456']);
  });

  it('detects "distinct_id" header and skips it from ids', () => {
    const csv = 'distinct_id\nuser-1\nuser-2';
    const result = parseCohortCsv(csv);
    expect(result.idType).toBe('distinct_id');
    expect(result.ids).toEqual(['user-1', 'user-2']);
  });

  it('detects "id" header (alias for distinct_id) and skips it from ids', () => {
    const csv = 'id\nuser-a';
    const result = parseCohortCsv(csv);
    expect(result.idType).toBe('distinct_id');
    expect(result.ids).toEqual(['user-a']);
  });

  it('detects "user_id" header (alias for distinct_id) and skips it from ids', () => {
    const csv = 'user_id\nuid-1\nuid-2';
    const result = parseCohortCsv(csv);
    expect(result.idType).toBe('distinct_id');
    expect(result.ids).toEqual(['uid-1', 'uid-2']);
  });

  it('detects "email" header and returns idType=email', () => {
    const csv = 'email\nalice@example.com\nbob@example.com';
    const result = parseCohortCsv(csv);
    expect(result.idType).toBe('email');
    expect(result.ids).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('detects "e-mail" header (alias for email) and returns idType=email', () => {
    const csv = 'e-mail\nalice@example.com';
    const result = parseCohortCsv(csv);
    expect(result.idType).toBe('email');
    expect(result.ids).toEqual(['alice@example.com']);
  });

  it('header matching is case-insensitive', () => {
    const csvUpper = 'EMAIL\nalice@example.com';
    const resultUpper = parseCohortCsv(csvUpper);
    expect(resultUpper.idType).toBe('email');
    expect(resultUpper.ids).toEqual(['alice@example.com']);

    const csvMixed = 'Person_Id\nabc-123';
    const resultMixed = parseCohortCsv(csvMixed);
    expect(resultMixed.idType).toBe('distinct_id');
    expect(resultMixed.ids).toEqual(['abc-123']);
  });
});

describe('parseCohortCsv — empty / header-only inputs', () => {
  it('empty string returns empty ids array (no throw)', () => {
    const result = parseCohortCsv('');
    expect(result.ids).toEqual([]);
  });

  it('CSV with only the recognised email header returns empty ids array (no throw)', () => {
    const result = parseCohortCsv('email');
    expect(result.idType).toBe('email');
    expect(result.ids).toHaveLength(0);
  });

  it('CSV with person_id header only returns empty ids array (no throw)', () => {
    const result = parseCohortCsv('person_id\n');
    expect(result.idType).toBe('distinct_id');
    expect(result.ids).toHaveLength(0);
  });
});

describe('parseCohortCsv — unrecognised header throws AppBadRequestException', () => {
  it('throws when the first row is not a recognised column header', () => {
    const csv = 'some-unknown-value\nother-value';
    expect(() => parseCohortCsv(csv)).toThrow(AppBadRequestException);
  });

  it('throws when the first row is a UUID (not a header keyword)', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const csv = `${uuid}\nanother-uuid`;
    expect(() => parseCohortCsv(csv)).toThrow(AppBadRequestException);
  });

  it('throws when the first row looks like an email address (not a header keyword)', () => {
    const csv = 'alice@example.com\nbob@example.com';
    expect(() => parseCohortCsv(csv)).toThrow(AppBadRequestException);
  });

  it('error message mentions the allowed header names', () => {
    const csv = 'unknown_column\nvalue';
    expect(() => parseCohortCsv(csv)).toThrow(/person_id|distinct_id|email/);
  });
});

describe('parseCohortCsv — multi-column CSV', () => {
  it('only reads the first column value from each row', () => {
    const csv = 'email,name\nalice@example.com,Alice\nbob@example.com,Bob';
    const result = parseCohortCsv(csv);
    expect(result.idType).toBe('email');
    expect(result.ids).toEqual(['alice@example.com', 'bob@example.com']);
  });
});

describe('parseCohortCsv — filters empty/blank lines', () => {
  it('ignores empty rows between data rows', () => {
    const csv = 'person_id\nabc\n\ndef\n';
    const result = parseCohortCsv(csv);
    expect(result.ids).toEqual(['abc', 'def']);
  });
});
