import { createHash } from 'crypto';

/**
 * Fixed namespace UUID for Qurvo person ID generation (UUIDv5).
 * NEVER change this value — doing so would produce different person IDs
 * for the same project+distinct_id pair, breaking identity resolution.
 */
const NAMESPACE_BYTES = Buffer.from(
  'a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d',
  'hex',
);

/**
 * Generate a deterministic UUIDv5 person ID from project + distinct_id.
 * Same inputs always produce the same UUID. Uses SHA-1 per RFC 4122 §4.3.
 */
export function deterministicPersonId(projectId: string, distinctId: string): string {
  const hash = createHash('sha1');
  hash.update(NAMESPACE_BYTES);
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
