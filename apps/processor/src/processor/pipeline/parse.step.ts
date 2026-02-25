import type { RawMessage } from './types';
import { parseRedisFields } from '../redis-utils';

/** Step 1: Parse flat Redis field arrays into structured objects. */
export function parseMessages(messages: [string, string[]][]): RawMessage[] {
  return messages.map(([id, fields]) => ({
    id,
    fields: parseRedisFields(fields),
  }));
}
