export function aiQuotaCounterKey(userId: string, now = new Date()): string {
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `ai:quota:${userId}:${monthKey}`;
}
