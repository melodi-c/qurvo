export interface ParsedUserProperties {
  setProps: Record<string, unknown>;
  setOnceProps: Record<string, unknown>;
  unsetKeys: string[];
}

/**
 * High-churn person properties that change on every pageview/session.
 * These are already stored as dedicated columns on CH events, so storing
 * them in PG persons.properties is redundant and causes unnecessary writes.
 * Inspired by PostHog's isFilteredPersonUpdateProperty().
 */
const NOISY_PERSON_PROPERTIES = new Set([
  '$browser', '$browser_version',
  '$os', '$os_version',
  '$device_type',
  '$screen_width', '$screen_height',
  '$viewport_width', '$viewport_height',
  '$current_url', '$referrer', '$referring_domain',
  '$pathname',
  '$ip', '$geoip_country_code', '$geoip_city_name',
  '$timezone', '$language',
]);

function filterNoisy(props: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!NOISY_PERSON_PROPERTIES.has(k)) {
      filtered[k] = v;
    }
  }
  return filtered;
}

/**
 * Parses the user_properties JSON field from an event.
 *
 * PostHog-style semantics:
 *  - root-level keys (not $set/$set_once/$unset) → implicit $set
 *  - $set object → explicit set (overwrites existing)
 *  - $set_once object → only sets if property doesn't exist yet
 *  - $unset array → removes listed keys
 *
 * High-churn properties (browser, OS, screen size, etc.) are filtered
 * out to reduce PG write amplification — they're already in CH event columns.
 */
export function parseUserProperties(raw: string): ParsedUserProperties {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    obj = {};
  }

  const setOnceProps = filterNoisy((obj['$set_once'] as Record<string, unknown> | undefined) ?? {});
  const unsetKeys = Array.isArray(obj['$unset']) ? (obj['$unset'] as unknown[]).filter((k): k is string => typeof k === 'string') : [];
  const explicitSet = (obj['$set'] as Record<string, unknown> | undefined) ?? {};

  // All root-level keys that are not reserved are treated as implicit $set
  const setProps: Record<string, unknown> = { ...filterNoisy(explicitSet) };
  for (const [k, v] of Object.entries(obj)) {
    if (k !== '$set' && k !== '$set_once' && k !== '$unset' && !NOISY_PERSON_PROPERTIES.has(k)) {
      setProps[k] = v;
    }
  }

  return { setProps, setOnceProps, unsetKeys };
}
