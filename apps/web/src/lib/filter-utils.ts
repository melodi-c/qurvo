import type { StepFilter } from '@/api/generated/Api';
import { NO_VALUE_OPS } from '@/components/StepFilterRow';

export function isValidFilter(f: StepFilter): boolean {
  if (f.property.trim() === '') {return false;}
  if (!NO_VALUE_OPS.has(f.operator) && (!f.value || f.value.trim() === '')) {return false;}
  return true;
}

export function parseFilters(raw: string | null): StepFilter[] {
  if (!raw) {return [];}
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {return [];}
    return parsed;
  } catch {
    return [];
  }
}
