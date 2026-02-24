import { eq } from 'drizzle-orm';
import { sessions } from '@qurvo/db';
import type { Database } from '@qurvo/db';
import type Redis from 'ioredis';

export async function invalidateUserSessionCaches(
  db: Database,
  redis: Redis,
  userId: string,
): Promise<void> {
  const userSessions = await db
    .select({ token_hash: sessions.token_hash })
    .from(sessions)
    .where(eq(sessions.user_id, userId));

  if (userSessions.length > 0) {
    const cacheKeys = userSessions.map((s) => `session:${s.token_hash}`);
    await redis.del(...cacheKeys);
  }
}
