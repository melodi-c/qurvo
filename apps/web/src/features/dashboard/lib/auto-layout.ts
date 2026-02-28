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

  const MAX_ROWS = 1000;

  return sorted.map((item) => {
    const w = Math.min(Math.max(item.w, 1), COLS);
    const h = Math.max(item.h, 1);

    for (let y = 0; y < MAX_ROWS; y++) {
      for (let x = 0; x <= COLS - w; x++) {
        if (canPlace(x, y, w, h)) {
          place(x, y, w, h);
          return { ...item, x, y, w, h };
        }
      }
    }

    console.warn(
      `[auto-layout] Could not place widget "${item.i}" (w=${item.w}, h=${item.h}) within ${MAX_ROWS} rows, placing at (0, ${grid.length})`,
    );
    const fallbackY = grid.length;
    place(0, fallbackY, w, h);
    return { ...item, x: 0, y: fallbackY, w, h };
  });
}
