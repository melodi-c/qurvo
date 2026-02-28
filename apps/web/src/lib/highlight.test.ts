import { describe, expect, it } from 'vitest';
import { parseHighlightedSnippet } from './highlight';

describe('parseHighlightedSnippet', () => {
  it('returns single segment for plain text without marks', () => {
    expect(parseHighlightedSnippet('hello world')).toEqual([
      { text: 'hello world', highlighted: false },
    ]);
  });

  it('parses a single <mark> tag', () => {
    expect(parseHighlightedSnippet('before <mark>match</mark> after')).toEqual([
      { text: 'before ', highlighted: false },
      { text: 'match', highlighted: true },
      { text: ' after', highlighted: false },
    ]);
  });

  it('parses multiple <mark> tags', () => {
    expect(parseHighlightedSnippet('<mark>first</mark> gap <mark>second</mark>')).toEqual([
      { text: 'first', highlighted: true },
      { text: ' gap ', highlighted: false },
      { text: 'second', highlighted: true },
    ]);
  });

  it('handles adjacent <mark> tags with no gap', () => {
    expect(parseHighlightedSnippet('<mark>a</mark><mark>b</mark>')).toEqual([
      { text: 'a', highlighted: true },
      { text: 'b', highlighted: true },
    ]);
  });

  it('returns empty array for empty string', () => {
    expect(parseHighlightedSnippet('')).toEqual([]);
  });

  it('preserves other HTML tags as literal text (not parsed)', () => {
    const input = 'text <img src=x onerror=alert(1)> <mark>safe</mark>';
    const result = parseHighlightedSnippet(input);
    expect(result).toEqual([
      { text: 'text <img src=x onerror=alert(1)> ', highlighted: false },
      { text: 'safe', highlighted: true },
    ]);
    // The <img> tag is just a string — React will escape it when rendered as text
  });

  it('handles case-insensitive <MARK> tags', () => {
    expect(parseHighlightedSnippet('before <MARK>match</MARK> after')).toEqual([
      { text: 'before ', highlighted: false },
      { text: 'match', highlighted: true },
      { text: ' after', highlighted: false },
    ]);
  });

  it('handles snippet with only a <mark> tag', () => {
    expect(parseHighlightedSnippet('<mark>only</mark>')).toEqual([
      { text: 'only', highlighted: true },
    ]);
  });

  it('handles ts_headline fragment delimiter', () => {
    const input = '<mark>first</mark> fragment … <mark>second</mark> fragment';
    expect(parseHighlightedSnippet(input)).toEqual([
      { text: 'first', highlighted: true },
      { text: ' fragment … ', highlighted: false },
      { text: 'second', highlighted: true },
      { text: ' fragment', highlighted: false },
    ]);
  });
});
