import { describe, it, expect, vi } from 'vitest';
import { computeAutoLayout } from './auto-layout';
import type { RglItem } from '../store';

function makeItem(overrides: Partial<RglItem> & { i: string }): RglItem {
  return { x: 0, y: 0, w: 4, h: 2, ...overrides };
}

describe('computeAutoLayout', () => {
  it('places items without overlap', () => {
    const items: RglItem[] = [
      makeItem({ i: 'a', w: 6, h: 2 }),
      makeItem({ i: 'b', w: 6, h: 2 }),
      makeItem({ i: 'c', w: 12, h: 1 }),
    ];
    const result = computeAutoLayout(items);

    expect(result[0]).toMatchObject({ i: 'a', x: 0, y: 0, w: 6, h: 2 });
    expect(result[1]).toMatchObject({ i: 'b', x: 6, y: 0, w: 6, h: 2 });
    expect(result[2]).toMatchObject({ i: 'c', x: 0, y: 2, w: 12, h: 1 });
  });

  it('clamps widget width > COLS (12) to 12 and does not hang', () => {
    const items: RglItem[] = [makeItem({ i: 'wide', w: 20, h: 2 })];
    const result = computeAutoLayout(items);

    expect(result).toHaveLength(1);
    expect(result[0].w).toBe(12);
    expect(result[0].x).toBe(0);
    expect(result[0].y).toBe(0);
  });

  it('clamps widget width of 0 to 1', () => {
    const items: RglItem[] = [makeItem({ i: 'zero', w: 0, h: 2 })];
    const result = computeAutoLayout(items);

    expect(result).toHaveLength(1);
    expect(result[0].w).toBe(1);
  });

  it('clamps widget height of 0 to 1', () => {
    const items: RglItem[] = [makeItem({ i: 'flat', w: 4, h: 0 })];
    const result = computeAutoLayout(items);

    expect(result).toHaveLength(1);
    expect(result[0].h).toBe(1);
  });

  it('clamps negative dimensions', () => {
    const items: RglItem[] = [makeItem({ i: 'neg', w: -5, h: -3 })];
    const result = computeAutoLayout(items);

    expect(result).toHaveLength(1);
    expect(result[0].w).toBe(1);
    expect(result[0].h).toBe(1);
  });

  it('handles empty input', () => {
    expect(computeAutoLayout([])).toEqual([]);
  });

  it('handles multiple oversized widgets', () => {
    const items: RglItem[] = [
      makeItem({ i: 'a', w: 15, h: 2 }),
      makeItem({ i: 'b', w: 20, h: 3 }),
    ];
    const result = computeAutoLayout(items);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ i: 'a', x: 0, y: 0, w: 12, h: 2 });
    expect(result[1]).toMatchObject({ i: 'b', x: 0, y: 2, w: 12, h: 3 });
  });
});
