import type { RglItem } from '../store';

const COLS = 12;

export function computeAutoLayout(items: RglItem[]): RglItem[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const grid: boolean[][] = [];

  const ensureRows = (upTo: number) => {
    while (grid.length <= upTo) grid.push(new Array(COLS).fill(false));
  };

  const canPlace = (x: number, y: number, w: number, h: number) => {
    ensureRows(y + h - 1);
    for (let r = y; r < y + h; r++) {
      for (let c = x; c < x + w; c++) {
        if (c >= COLS || grid[r][c]) return false;
      }
    }
    return true;
  };

  const place = (x: number, y: number, w: number, h: number) => {
    ensureRows(y + h - 1);
    for (let r = y; r < y + h; r++) {
      for (let c = x; c < x + w; c++) {
        grid[r][c] = true;
      }
    }
  };

  return sorted.map((item) => {
    for (let y = 0; ; y++) {
      for (let x = 0; x <= COLS - item.w; x++) {
        if (canPlace(x, y, item.w, item.h)) {
          place(x, y, item.w, item.h);
          return { ...item, x, y };
        }
      }
    }
  });
}
