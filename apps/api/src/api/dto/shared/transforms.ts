/**
 * Transform for query params that may arrive as JSON strings (GET requests)
 * or as native arrays (POST body). Returns parsed array or the value as-is.
 */
export function parseJsonArray({ value }: { value: unknown }): unknown {
  if (!value) return undefined;
  return typeof value === 'string' ? JSON.parse(value) : value;
}
