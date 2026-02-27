import { describe, it, expect } from 'vitest';
import { findSafeStartIndex } from '../../ai/ai-message-history';

type Msg = { role: string };

function msgs(...roles: string[]): Msg[] {
  return roles.map((role) => ({ role }));
}

describe('findSafeStartIndex', () => {
  it('returns 0 for an empty array', () => {
    expect(findSafeStartIndex([])).toBe(0);
  });

  it('returns 0 when the first message is user', () => {
    expect(findSafeStartIndex(msgs('user', 'assistant', 'user'))).toBe(0);
  });

  it('returns 0 when the first message is assistant', () => {
    expect(findSafeStartIndex(msgs('assistant', 'user'))).toBe(0);
  });

  it('returns 1 when there is exactly one leading orphaned tool message', () => {
    expect(findSafeStartIndex(msgs('tool', 'user', 'assistant'))).toBe(1);
  });

  it('returns 2 when there are two leading orphaned tool messages', () => {
    expect(findSafeStartIndex(msgs('tool', 'tool', 'user'))).toBe(2);
  });

  it('returns the full length when all messages are orphaned tool messages', () => {
    const input = msgs('tool', 'tool', 'tool');
    expect(findSafeStartIndex(input)).toBe(input.length);
  });

  it('does not skip tool messages that appear after a user or assistant message', () => {
    // [user, assistant+tool_calls, tool, user] — only index 0 is safe start
    expect(findSafeStartIndex(msgs('user', 'assistant', 'tool', 'user'))).toBe(0);
  });

  it('skips only the leading orphaned cluster, not interior tool messages', () => {
    // [tool, tool, user, tool, user] — skip first two, keep the rest
    expect(findSafeStartIndex(msgs('tool', 'tool', 'user', 'tool', 'user'))).toBe(2);
  });
});
