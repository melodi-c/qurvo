import { createHash } from 'crypto';
import type { Event } from '@qurvo/clickhouse';

/**
 * DNS namespace UUID bytes for UUIDv5 person ID generation.
 * RFC 4122 §4.3 — DNS namespace: 6ba7b810-9dad-11d1-80b4-00c04fd430c8
 */
const DNS_NAMESPACE_BYTES = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');

export interface EventDefinitionInput {
  eventName: string;
  displayName?: string;
}

export interface PropertyDefinitionInput {
  eventName: string;
  propertyName: string;
  displayName?: string;
}

export interface ScenarioOutput {
  events: Event[];
  definitions: EventDefinitionInput[];
  propertyDefinitions: PropertyDefinitionInput[];
  persons: { id: string; properties: Record<string, unknown> }[];
  personDistinctIds: { personId: string; distinctId: string }[];
}

export abstract class BaseScenario {
  abstract getScenarioName(): string;
  abstract generate(projectId: string): Promise<ScenarioOutput>;

  /**
   * Generate a deterministic UUIDv5 person ID compatible with the processor.
   * Uses DNS namespace (6ba7b810-9dad-11d1-80b4-00c04fd430c8) per RFC 4122 §4.3.
   */
  protected makePersonId(projectId: string, distinctId: string): string {
    const hash = createHash('sha1');
    hash.update(DNS_NAMESPACE_BYTES);
    hash.update(`${projectId}:${distinctId}`);
    const digest = hash.digest();

    // Set version 5 (byte 6, high nibble = 0101)
    digest[6] = (digest[6] & 0x0f) | 0x50;
    // Set variant 10xx (byte 8, high 2 bits)
    digest[8] = (digest[8] & 0x3f) | 0x80;

    const hex = digest.subarray(0, 16).toString('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-');
  }

  /**
   * Distribute `count` timestamps over the last `days` days.
   * Optionally weighted by `weights` array (index 0 = most recent day).
   */
  protected spreadOverDays(count: number, days: number, weights?: number[]): Date[] {
    const now = new Date();
    const dates: Date[] = [];

    for (let i = 0; i < count; i++) {
      let dayOffset: number;

      if (weights && weights.length > 0) {
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let rand = Math.random() * totalWeight;
        dayOffset = 0;
        for (let j = 0; j < Math.min(weights.length, days); j++) {
          rand -= weights[j];
          if (rand <= 0) {
            dayOffset = j;
            break;
          }
        }
      } else {
        dayOffset = Math.floor(Math.random() * days);
      }

      const d = new Date(now);
      d.setDate(d.getDate() - dayOffset);
      dates.push(d);
    }

    return dates;
  }

  /**
   * Apply a random time jitter of up to ±maxHours to a date.
   */
  protected jitter(date: Date, maxHours: number): Date {
    const ms = (Math.random() - 0.5) * 2 * maxHours * 3600 * 1000;
    return new Date(date.getTime() + ms);
  }
}
