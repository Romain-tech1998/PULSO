import { createHash } from 'node:crypto';

/**
 * Deterministic id derived from a stable dedupe key, so the same real-world
 * event maps to the same id across separate ingestion runs (needed for
 * merge-without-duplication per DATA-0001) without a database round-trip at
 * this stage. Formatted as a syntactically valid UUID (version 5-ish: content
 * hash, not random) so it satisfies PublicEvent's `z.uuid()` contract.
 *
 * This is a placeholder identity strategy, not a database primary key
 * decision - once a real events table exists, the authoritative id and
 * dedupe strategy belong there, informed by this hash as a stable candidate
 * key rather than replacing proper storage-level dedup.
 */
export function deriveDeterministicEventId(dedupeKey: string): string {
  const hash = createHash('sha256').update(dedupeKey).digest('hex');
  const bytes = hash.slice(0, 32);
  return [
    bytes.slice(0, 8),
    bytes.slice(8, 12),
    `5${bytes.slice(13, 16)}`,
    `${((parseInt(bytes[16]!, 16) & 0x3) | 0x8).toString(16)}${bytes.slice(17, 20)}`,
    bytes.slice(20, 32)
  ].join('-');
}
