/**
 * Lightweight per-IP in-process rate limiter.
 *
 * This is a best-effort, per-instance limiter (no cross-instance guarantee).
 * It protects against obvious abuse on a single Vercel function instance.
 * For production cross-instance rate limiting, use an edge middleware with
 * Redis or Vercel KV (documented as a post-MVP upgrade path).
 *
 * Algorithm: sliding window token bucket.
 */

import { config } from "../config";

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Sweep stale buckets periodically to avoid unbounded memory growth.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60_000; // 5 minutes

function maybeSweep(): void {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > config.RATE_LIMIT_WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

/**
 * Check whether a request from `ip` is within the rate limit.
 * Returns true if the request is allowed, false if rate-limited.
 */
export function checkRateLimit(ip: string): boolean {
  maybeSweep();
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || now - bucket.windowStart > config.RATE_LIMIT_WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= config.RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  buckets.set(ip, { count: bucket.count + 1, windowStart: bucket.windowStart });
  return true;
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
