import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import {
  setupContainers,
  insertTestEvents,
  buildEvent,
  ts,
  type ContainerContext,
} from '@qurvo/testing';
import { queryEventPropertyNames } from '../../events/event-property-names.query';
import { DIRECT_COLUMNS } from '../../utils/property-filter';

let ctx: ContainerContext;

beforeAll(async () => {
  ctx = await setupContainers();
}, 120_000);

describe('queryEventPropertyNames', () => {
  it('returns direct columns even when no events exist', async () => {
    const projectId = randomUUID();

    const result = await queryEventPropertyNames(ctx.ch, { project_id: projectId });

    // Should include all direct columns
    const directCols = [...DIRECT_COLUMNS].sort();
    expect(result.slice(0, directCols.length)).toEqual(directCols);
  });

  it('extracts keys from properties JSON', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'purchase',
        timestamp: ts(1),
        properties: JSON.stringify({ plan: 'premium', amount: '99' }),
      }),
    ]);

    const result = await queryEventPropertyNames(ctx.ch, { project_id: projectId });

    expect(result).toContain('properties.plan');
    expect(result).toContain('properties.amount');
  });

  it('extracts keys from user_properties JSON', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'login',
        timestamp: ts(1),
        user_properties: JSON.stringify({ email: 'test@example.com', role: 'admin' }),
      }),
    ]);

    const result = await queryEventPropertyNames(ctx.ch, { project_id: projectId });

    expect(result).toContain('user_properties.email');
    expect(result).toContain('user_properties.role');
  });

  it('combines properties and user_properties keys without duplicates', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'page_view',
        timestamp: ts(2),
        properties: JSON.stringify({ utm_source: 'google' }),
        user_properties: JSON.stringify({ plan: 'free' }),
      }),
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'click',
        timestamp: ts(1),
        properties: JSON.stringify({ utm_source: 'google', button: 'cta' }),
      }),
    ]);

    const result = await queryEventPropertyNames(ctx.ch, { project_id: projectId });

    expect(result).toContain('properties.utm_source');
    expect(result).toContain('properties.button');
    expect(result).toContain('user_properties.plan');

    // utm_source should appear only once (deduplication)
    const utmCount = result.filter((k) => k === 'properties.utm_source').length;
    expect(utmCount).toBe(1);
  });

  it('does not return keys from other projects', async () => {
    const projectA = randomUUID();
    const projectB = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectA,
        person_id: personId,
        event_name: 'event_a',
        timestamp: ts(1),
        properties: JSON.stringify({ secret: 'value' }),
      }),
      buildEvent({
        project_id: projectB,
        person_id: personId,
        event_name: 'event_b',
        timestamp: ts(1),
        properties: JSON.stringify({ public: 'value' }),
      }),
    ]);

    const resultA = await queryEventPropertyNames(ctx.ch, { project_id: projectA });
    const resultB = await queryEventPropertyNames(ctx.ch, { project_id: projectB });

    expect(resultA).toContain('properties.secret');
    expect(resultA).not.toContain('properties.public');

    expect(resultB).toContain('properties.public');
    expect(resultB).not.toContain('properties.secret');
  });

  it('returns results sorted alphabetically', async () => {
    const projectId = randomUUID();
    const personId = randomUUID();

    await insertTestEvents(ctx.ch, [
      buildEvent({
        project_id: projectId,
        person_id: personId,
        event_name: 'test',
        timestamp: ts(1),
        properties: JSON.stringify({ zebra: '1', alpha: '2' }),
        user_properties: JSON.stringify({ beta: '3' }),
      }),
    ]);

    const result = await queryEventPropertyNames(ctx.ch, { project_id: projectId });

    // Direct columns come first (sorted), then properties.* and user_properties.* (sorted)
    const directCols = [...DIRECT_COLUMNS].sort();
    const jsonKeys = result.slice(directCols.length);

    // JSON keys should be sorted
    const sortedJsonKeys = [...jsonKeys].sort();
    expect(jsonKeys).toEqual(sortedJsonKeys);
  });
});
