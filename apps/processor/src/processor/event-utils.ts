/** Safely parse a screen dimension value (width/height) to a non-negative integer. */
export function safeScreenDimension(value: unknown): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
