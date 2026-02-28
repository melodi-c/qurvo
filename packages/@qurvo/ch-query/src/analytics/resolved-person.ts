import type { AliasExpr, RawExpr } from '../ast';
import { raw } from '../builders';

/**
 * The raw SQL expression for resolving a person's canonical ID via the
 * person_overrides_dict dictionary.
 *
 * coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)
 */
const RESOLVED_PERSON_SQL =
  `coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;

/**
 * Returns an Expr representing the RESOLVED_PERSON expression with .as() support:
 * coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)
 */
export function resolvedPerson(): RawExpr & { as(alias: string): AliasExpr } {
  return raw(RESOLVED_PERSON_SQL);
}

export { RESOLVED_PERSON_SQL as RESOLVED_PERSON };
