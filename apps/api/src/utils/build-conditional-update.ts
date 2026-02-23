export function buildConditionalUpdate<T extends Record<string, unknown>>(
  input: T,
  fields: (keyof T)[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) {
      result[field as string] = input[field];
    }
  }
  return result;
}
