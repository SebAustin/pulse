/**
 * In-process micro-cache for SSE snapshots.
 *
 * Deduplicates DynamoDB reads when multiple viewers of the same event
 * share a warm Vercel function instance (PLAN §5.1).
 *
 * Cache TTL = SSE_CACHE_TTL_MS (default 500 ms — inside the latency budget).
 * Not shared across instances; each serverless instance has its own Map.
 */

import type { Snapshot } from "../dynamo/types";
import { config } from "../config";

interface CacheEntry {
  snapshot: Snapshot;
  expiry: number; // epoch ms
}

const cache = new Map<string, CacheEntry>();

/**
 * Get a cached snapshot if still within TTL, or null on miss/expiry.
 */
export function getCachedSnapshot(eventId: string): Snapshot | null {
  const entry = cache.get(eventId);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(eventId);
    return null;
  }
  return entry.snapshot;
}

/**
 * Store a snapshot in the cache with TTL = now + SSE_CACHE_TTL_MS.
 */
export function setCachedSnapshot(eventId: string, snapshot: Snapshot): void {
  cache.set(eventId, {
    snapshot,
    expiry: Date.now() + config.SSE_CACHE_TTL_MS,
  });
}

/**
 * Evict the cache entry for an event (e.g., on event close).
 */
export function evictCachedSnapshot(eventId: string): void {
  cache.delete(eventId);
}

/** Clear all cache entries (useful in tests). */
export function clearSnapshotCache(): void {
  cache.clear();
}
