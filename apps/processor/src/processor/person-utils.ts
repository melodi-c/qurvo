export interface ParsedUserProperties {
  setProps: Record<string, unknown>;
  setOnceProps: Record<string, unknown>;
  unsetKeys: string[];
}

/**
 * Parses the user_properties JSON field from an event.
 *
 * PostHog-style semantics:
 *  - root-level keys (not $set/$set_once/$unset) → implicit $set
 *  - $set object → explicit set (overwrites existing)
 *  - $set_once object → only sets if property doesn't exist yet
 *  - $unset array → removes listed keys
 */
export function parseUserProperties(raw: string): ParsedUserProperties {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    obj = {};
  }

  const setOnceProps = (obj['$set_once'] as Record<string, unknown> | undefined) ?? {};
  const unsetKeys = Array.isArray(obj['$unset']) ? (obj['$unset'] as unknown[]).filter((k): k is string => typeof k === 'string') : [];
  const explicitSet = (obj['$set'] as Record<string, unknown> | undefined) ?? {};

  // All root-level keys that are not reserved are treated as implicit $set
  const setProps: Record<string, unknown> = { ...explicitSet };
  for (const [k, v] of Object.entries(obj)) {
    if (k !== '$set' && k !== '$set_once' && k !== '$unset') {
      setProps[k] = v;
    }
  }

  return { setProps, setOnceProps, unsetKeys };
}
