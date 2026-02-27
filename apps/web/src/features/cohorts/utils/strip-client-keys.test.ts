import { describe, it, expect } from 'vitest';
import { stripClientKeys } from './strip-client-keys';
import type { CohortConditionGroup } from '@/features/cohorts/types';

describe('stripClientKeys', () => {
  it('removes _key from a flat AND group with conditions', () => {
    const input: CohortConditionGroup = {
      type: 'AND',
      _key: 'group-key-1',
      values: [
        { type: 'event', event_name: 'click', count_operator: 'gte', count: 1, time_window_days: 30, _key: 'cond-key-1' },
        { type: 'person_property', property: 'plan', operator: 'eq', value: 'pro', _key: 'cond-key-2' },
      ],
    };

    const result = stripClientKeys(input);

    expect(result).not.toHaveProperty('_key');
    expect(result.values[0]).not.toHaveProperty('_key');
    expect(result.values[1]).not.toHaveProperty('_key');

    // Actual data should be preserved
    expect(result.type).toBe('AND');
    expect((result.values[0] as { event_name: string }).event_name).toBe('click');
    expect((result.values[1] as { property: string }).property).toBe('plan');
  });

  it('removes _key from nested OR/AND groups recursively', () => {
    const input: CohortConditionGroup = {
      type: 'OR',
      _key: 'root-key',
      values: [
        {
          type: 'AND',
          _key: 'group-key-1',
          values: [
            { type: 'first_time_event', event_name: 'signup', time_window_days: 7, _key: 'cond-a' },
          ],
        },
        {
          type: 'AND',
          _key: 'group-key-2',
          values: [
            { type: 'cohort', cohort_id: 'abc123', negated: false, _key: 'cond-b' },
          ],
        },
      ],
    };

    const result = stripClientKeys(input);

    expect(result).not.toHaveProperty('_key');
    const group1 = result.values[0] as CohortConditionGroup;
    const group2 = result.values[1] as CohortConditionGroup;

    expect(group1).not.toHaveProperty('_key');
    expect(group1.values[0]).not.toHaveProperty('_key');

    expect(group2).not.toHaveProperty('_key');
    expect(group2.values[0]).not.toHaveProperty('_key');

    // Structural integrity
    expect(result.type).toBe('OR');
    expect(group1.type).toBe('AND');
    expect(group2.type).toBe('AND');
  });

  it('works on groups without any _key fields', () => {
    const input: CohortConditionGroup = {
      type: 'AND',
      values: [
        { type: 'event', event_name: 'purchase', count_operator: 'gte', count: 2, time_window_days: 14 },
      ],
    };

    const result = stripClientKeys(input);
    expect(result.type).toBe('AND');
    expect((result.values[0] as { event_name: string }).event_name).toBe('purchase');
  });

  it('handles empty values array', () => {
    const input: CohortConditionGroup = {
      type: 'AND',
      _key: 'empty-group',
      values: [],
    };

    const result = stripClientKeys(input);
    expect(result).not.toHaveProperty('_key');
    expect(result.values).toHaveLength(0);
  });
});
