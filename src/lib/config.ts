/**
 * Centralised configuration for Pulse.
 * All values read from environment variables with safe defaults.
 * Imported by repository, SSE handler, presence logic, and scripts.
 */

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) ? fallback : n;
}

export const config = {
  // Shard count for write-sharded counters (min 10 per NFR-01.4)
  SHARD_COUNT: Math.max(10, envInt("SHARD_COUNT", 10)),

  // SSE / polling cadence
  SSE_INTERVAL_MS: envInt("SSE_INTERVAL_MS", 1000),
  SSE_CACHE_TTL_MS: envInt("SSE_CACHE_TTL_MS", 500),
  POLL_INTERVAL_MS: envInt("POLL_INTERVAL_MS", 3000),

  // Host token
  HOST_TOKEN_BYTES: envInt("HOST_TOKEN_BYTES", 16),

  // Presence (AP-21, AP-22, §8)
  PRESENCE_TTL_SEC: envInt("PRESENCE_TTL_SEC", 15),
  PRESENCE_HEARTBEAT_MS: envInt("PRESENCE_HEARTBEAT_MS", 5000),

  // Ops write-rate rolling window (§4.4)
  OPS_WINDOW_SEC: envInt("OPS_WINDOW_SEC", 5),
  OPS_WRITES_TTL_SEC: envInt("OPS_WRITES_TTL_SEC", 60),

  // Ephemeral reaction replay window (§3.6)
  REACTION_TTL_SEC: envInt("REACTION_TTL_SEC", 600),

  // Durable item retention floor (§3.6)
  JUDGING_WINDOW_DAYS: envInt("JUDGING_WINDOW_DAYS", 30),

  // Trivia scoring (A-23)
  BASE_POINTS: 1000,

  // Grace period after timeLimitSec: answers arriving up to GRACE_MS late
  // are still recorded (zero points) but not rejected entirely.
  TRIVIA_GRACE_MS: 2000,

  // Emoji palette (A-22)
  EMOJI_PALETTE: ["🔥", "❤️", "😂", "👏", "😮", "🎉"] as const,

  // Leaderboard default size
  LEADERBOARD_TOP_N: 10,

  // Rate limiting (per-IP, best-effort in-process; no cross-instance guarantee)
  RATE_LIMIT_WINDOW_MS: 60_000, // 1 minute
  RATE_LIMIT_MAX_REQUESTS: 120,  // 2 per second average

  // OpenAI (optional AI assist — gated; feature hides itself when key absent)
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  OPENAI_MODEL: process.env.OPENAI_MODEL ?? "gpt-4o-mini",

  /**
   * Secret used to HMAC-sign participant cookies (F-02 / SC-identity).
   *
   * NON-PRODUCTION DEFAULT: a fixed dev secret is used when the env var is
   * absent so local development works out of the box without any setup.
   * PRODUCTION MUST set PULSE_SESSION_SECRET to a strong random value
   * (32+ bytes of entropy, e.g. `openssl rand -base64 32`).
   */
  PULSE_SESSION_SECRET:
    process.env.PULSE_SESSION_SECRET ??
    // Fixed dev-only fallback — DO NOT use this value in production.
    "dev-only-pulse-session-secret-change-in-prod",
} as const;

export type EmojiPalette = (typeof config.EMOJI_PALETTE)[number];
