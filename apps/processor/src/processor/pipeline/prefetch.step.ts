import type { ValidMessage, PersonKey } from './types';
import type { PersonResolverService } from '../person-resolver.service';

/** Step 3: Collect unique person keys and batch-prefetch from Redis (single MGET). */
export function prefetchPersons(
  valid: ValidMessage[],
  personResolver: PersonResolverService,
): Promise<Map<string, string>> {
  const uniqueKeys = new Map<string, PersonKey>();

  for (const item of valid) {
    const key = `${item.fields.project_id}:${item.fields.distinct_id}`;
    if (!uniqueKeys.has(key)) {
      uniqueKeys.set(key, { projectId: item.fields.project_id, distinctId: item.fields.distinct_id });
    }
    if (item.fields.event_name === '$identify' && item.fields.anonymous_id) {
      const anonKey = `${item.fields.project_id}:${item.fields.anonymous_id}`;
      if (!uniqueKeys.has(anonKey)) {
        uniqueKeys.set(anonKey, { projectId: item.fields.project_id, distinctId: item.fields.anonymous_id });
      }
    }
  }

  return personResolver.prefetchPersonIds(Array.from(uniqueKeys.values()));
}
