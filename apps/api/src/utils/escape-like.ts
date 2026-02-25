/**
 * Escapes LIKE-wildcard characters (%, _, \) in a user-provided string
 * so they are treated as literals in SQL LIKE / ILIKE patterns.
 */
export function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => '\\' + ch);
}
