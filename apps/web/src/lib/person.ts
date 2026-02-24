/** Extract a human-readable display name from a person record. */
export function getPersonDisplayName(
  person: { id: string; distinct_ids: string[]; properties?: unknown } | null | undefined,
  fallbackId?: string,
): string {
  const props = (person?.properties ?? {}) as Record<string, unknown>;
  return (
    String(props['name'] ?? props['$name'] ?? '') ||
    String(props['email'] ?? props['$email'] ?? '') ||
    person?.distinct_ids[0] ||
    person?.id?.slice(0, 8) ||
    fallbackId ||
    ''
  );
}

/** Extract name and email separately for table rows. */
export function getPersonFields(properties: unknown): { name: string; email: string } {
  const props = (properties ?? {}) as Record<string, unknown>;
  return {
    name: String(props['name'] ?? props['$name'] ?? ''),
    email: String(props['email'] ?? props['$email'] ?? ''),
  };
}
