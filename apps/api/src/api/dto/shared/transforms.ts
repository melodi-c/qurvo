import { plainToInstance } from 'class-transformer';
import { AppBadRequestException } from '../../../exceptions/app-bad-request.exception';

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppBadRequestException(`Invalid JSON in query parameter`);
  }
}

/**
 * Transform for query params that may arrive as JSON strings (GET requests)
 * or as native arrays (POST body). Returns parsed array or the value as-is.
 */
export function parseJsonArray({ value }: { value: unknown }): unknown {
  if (!value) {return undefined;}
  return typeof value === 'string' ? safeJsonParse(value) : value;
}

/**
 * Transform for JSON-encoded arrays that need to be instantiated as class instances.
 * Parses JSON string if needed, then applies plainToInstance for nested validation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeJsonArrayTransform(targetClass: new (...args: any[]) => any) {
  return ({ value }: { value: unknown }): unknown => {
    if (!value) {return undefined;}
    const arr = typeof value === 'string' ? safeJsonParse(value) : value;
    return Array.isArray(arr) ? plainToInstance(targetClass, arr) : arr;
  };
}
