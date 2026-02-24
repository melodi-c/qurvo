/** Safely parse a screen dimension value (width/height) to a non-negative integer. */
export function safeScreenDimension(value: unknown): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Group items by a string key, preserving insertion order within each group. */
export function groupByKey<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}
