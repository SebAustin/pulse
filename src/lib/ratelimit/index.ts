/**
 * Lightweight per-IP in-process rate limiter.
 *
 * This is a best-effort, per-instance limiter (no cross-instance guarantee).
 * It protects against obvious abuse on a single Vercel function instance.
 * For production cross-instance rate limiting, use an edge middleware with
 * Redis or Vercel KV (documented as a post-MVP upgrade path).
 *
 * Algorithm: sliding window token bucket.
 *
 * NOTE — True Sybil resistance (F-02) requires binding interactions to a
 * server-issued, authenticated participant token (e.g. httpOnly cookie).
 * IP-scoped limits here raise the cost of ballot-stuffing significantly
 * without requiring accounts, which is an intentional non-goal for this
 * product.  An attacker with multiple IPs or a rotating proxy can still
 * circumvent this; that risk is documented and accepted.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Sweep stale buckets periodically to avoid unbounded memory growth.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60_000; // 5 minutes

// ---------------------------------------------------------------------------
// Limit presets (requests per windowMs)
// ---------------------------------------------------------------------------

/** Rate limit configuration for a specific endpoint category. */
export interface RateLimitConfig {
  /** Rolling window in milliseconds. */
  readonly windowMs: number;
  /** Maximum requests allowed within the window. */
  readonly maxRequests: number;
}

/**
 * Join endpoint: 5 attempts per minute per IP per eventId.
 * Joining more than 5 times from the same IP to the same event within a
 * minute is a strong indicator of participantId rotation / ballot stuffing.
 */
export const JOIN_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 5,
};

/**
 * Write endpoints (votes, reactions, words, trivia): 30 per minute per IP
 * per eventId.  This is generous for legitimate audience interaction (one
 * reaction every ~2 s) while blocking automated flooding.
 */
export const WRITE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 30,
};

/**
 * Default / legacy limit kept for callers that do not specify a config.
 * Matches the original RATE_LIMIT_* values from config.ts (120/min).
 */
const DEFAULT_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 120,
};

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

function maybeSweep(): void {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  // Use the widest window for sweep decisions (join and write are both 60s)
  const maxWindowMs = 60_000;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > maxWindowMs) {
      buckets.delete(key);
    }
  }
}

/**
 * Check whether a request identified by `key` is within the provided limit.
 * Returns true if the request is allowed, false if rate-limited.
 *
 * @param key  - Opaque rate-limit key (e.g. "ip:eventId" or bare IP).
 * @param cfg  - Window and max-request configuration.
 */
export function checkRateLimitKeyed(
  key: string,
  cfg: RateLimitConfig = DEFAULT_LIMIT
): boolean {
  maybeSweep();
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > cfg.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= cfg.maxRequests) {
    return false;
  }

  buckets.set(key, { count: bucket.count + 1, windowStart: bucket.windowStart });
  return true;
}

/**
 * Check whether a request from `ip` is within the rate limit.
 * Returns true if the request is allowed, false if rate-limited.
 *
 * @deprecated Prefer {@link checkRateLimitKeyed} with an explicit config and
 *   a composite key (IP + eventId) for endpoint-scoped limits.
 */
export function checkRateLimit(ip: string): boolean {
  return checkRateLimitKeyed(ip, DEFAULT_LIMIT);
}

/**
 * Build a composite rate-limit key from a client IP and an event ID.
 * Scoping by eventId means an attacker flooding one event does not consume
 * the limit for participants in other events from the same IP.
 */
export function rateLimitKey(ip: string, eventId: string): string {
  return `${ip}:${eventId}`;
}

/**
 * Extract the best available IP from a Next.js request.
 * Falls back to a constant so the limiter degrades gracefully
 * when the IP cannot be determined (e.g., in tests).
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Clear all buckets (for tests). */
export function clearRateLimits(): void {
  buckets.clear();
}
