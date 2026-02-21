export function toChTs(iso: string, endOfDay = false): string {
  if (iso.length === 10 && endOfDay) return `${iso} 23:59:59`;
  return iso.replace('T', ' ').replace('Z', '');
}

export const RESOLVED_PERSON =
  `coalesce(dictGetOrNull('person_overrides_dict', 'person_id', (project_id, distinct_id)), person_id)`;
