import { describe, it, expect } from 'vitest';
import { escapeLikePattern } from '@qurvo/ch-query';

describe('escapeLikePattern', () => {
  it('returns empty string unchanged', () => {
    expect(escapeLikePattern('')).toBe('');
  });

  it('returns plain string unchanged', () => {
    expect(escapeLikePattern('hello world')).toBe('hello world');
  });

  it('escapes percent sign', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
  });

  it('escapes underscore', () => {
    expect(escapeLikePattern('user_name')).toBe('user\\_name');
  });

  it('escapes backslash', () => {
    expect(escapeLikePattern('path\\to\\file')).toBe('path\\\\to\\\\file');
  });

  it('escapes multiple special characters in one string', () => {
    expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
  });

  it('escapes percent and underscore together', () => {
    expect(escapeLikePattern('50%_off')).toBe('50\\%\\_off');
  });

  it('handles string with only special characters', () => {
    expect(escapeLikePattern('%%%')).toBe('\\%\\%\\%');
    expect(escapeLikePattern('___')).toBe('\\_\\_\\_');
  });

  it('does not escape other characters', () => {
    expect(escapeLikePattern('hello@world.com')).toBe('hello@world.com');
    expect(escapeLikePattern('(test)')).toBe('(test)');
  });
});
