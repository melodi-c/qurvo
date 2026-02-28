export type ValueType = 'String' | 'Numeric' | 'Boolean' | 'DateTime';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T|\s)/;
const DATE_RE = /^((\d{4}[/-][0-2]\d[/-][0-3]\d)|([0-2]\d[/-][0-3]\d[/-]\d{4}))([ T][0-2]\d:[0-6]\d:[0-6]\d.*)?$/;
const SIX_MONTHS_S = 15_768_000;
const TEN_YEARS_S = 10 * 365 * 24 * 60 * 60;

/** Keywords in property names that hint at DateTime type (PostHog: DATETIME_PROPERTY_NAME_KEYWORDS). */
const DATETIME_NAME_KEYWORDS = ['time', 'timestamp', 'date', '_at', '-at', 'createdat', 'updatedat'];

export function isLikelyDateString(s: string): boolean {
  return ISO_DATE_RE.test(s) || DATE_RE.test(s.trim());
}

export function isLikelyUnixTimestamp(n: number): boolean {
  if (!Number.isFinite(n) || n < 0) {return false;}
  const nowS = Math.floor(Date.now() / 1000);
  return n >= nowS - SIX_MONTHS_S && n <= nowS + TEN_YEARS_S;
}

/**
 * Detect the value type of a property value.
 *
 * A4: Returns null for null, objects, and arrays (non-primitive values).
 * A5: Hard-coded overrides for utm_*, $feature/*, $survey_response*, and DateTime heuristics.
 *
 * Matches PostHog's `detect_property_type` from property-defs-rs/src/types.rs.
 */
export function detectValueType(key: string, value: unknown): ValueType | null {
  const lowerKey = key.toLowerCase();

  // A5: Hard-coded overrides — always String regardless of value
  if (lowerKey.startsWith('utm_') || lowerKey.startsWith('$initial_utm_')) {return 'String';}
  if (lowerKey.startsWith('$feature/')) {return 'String';}
  if (lowerKey === '$feature_flag_response') {return 'String';}
  if (lowerKey.startsWith('$survey_response')) {return 'String';}

  // A5: DateTime heuristic by property name + value
  if (DATETIME_NAME_KEYWORDS.some((kw) => lowerKey.includes(kw))) {
    if (typeof value === 'string' && isLikelyDateString(value)) {return 'DateTime';}
    if (typeof value === 'number' && isLikelyUnixTimestamp(value)) {return 'DateTime';}
  }

  // Standard type detection
  if (typeof value === 'boolean') {return 'Boolean';}
  if (typeof value === 'number') {return 'Numeric';}
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === 'true' || trimmed === 'false' || trimmed === 'TRUE' || trimmed === 'FALSE') {return 'Boolean';}
    if (isLikelyDateString(value)) {return 'DateTime';}
    if (trimmed !== '' && !isNaN(Number(trimmed))) {return 'Numeric';}
    return 'String';
  }

  // A4: null, objects, arrays → null (property_type stays NULL in DB, will be filled later)
  return null;
}
