export function toChTs(iso: string, endOfDay = false): string {
  if (iso.length === 10 && endOfDay) return `${iso} 23:59:59`;
  return iso.replace('T', ' ').replace('Z', '');
}

export { RESOLVED_PERSON } from '@qurvo/cohort-query';
