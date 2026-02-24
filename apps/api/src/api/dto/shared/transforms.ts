import { plainToInstance } from 'class-transformer';

/**
 * Transform for query params that may arrive as JSON strings (GET requests)
 * or as native arrays (POST body). Returns parsed array or the value as-is.
 */
export function parseJsonArray({ value }: { value: unknown }): unknown {
  if (!value) return undefined;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

/**
 * Transform for JSON-encoded arrays that need to be instantiated as class instances.
 * Parses JSON string if needed, then applies plainToInstance for nested validation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeJsonArrayTransform(targetClass: new (...args: any[]) => any) {
  return ({ value }: { value: unknown }): unknown => {
    if (!value) return undefined;
    const arr = typeof value === 'string' ? JSON.parse(value as string) : value;
    return Array.isArray(arr) ? plainToInstance(targetClass, arr) : arr;
  };
}
