/**
 * Unit tests for src/lib/ratelimit/index.ts
 *
 * Tests: per-key isolation, window expiry, keyed limits (JOIN_LIMIT / WRITE_LIMIT),
 * and the composite key builder (F-02 / F-06).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimitKeyed,
  checkRateLimit,
  rateLimitKey,
  clearRateLimits,
  JOIN_LIMIT,
  WRITE_LIMIT,
} from "../../src/lib/ratelimit";

beforeEach(() => {
  clearRateLimits();
});

describe("rateLimitKey", () => {
  it("combines ip and eventId with a separator", () => {
    const key = rateLimitKey("1.2.3.4", "evt_abc");
    expect(key).toBe("1.2.3.4:evt_abc");
  });

  it("produces different keys for different events from the same IP", () => {
    const keyA = rateLimitKey("1.2.3.4", "evt_A");
    const keyB = rateLimitKey("1.2.3.4", "evt_B");
    expect(keyA).not.toBe(keyB);
  });

  it("produces different keys for different IPs in the same event", () => {
    const keyA = rateLimitKey("1.1.1.1", "evt_X");
    const keyB = rateLimitKey("2.2.2.2", "evt_X");
    expect(keyA).not.toBe(keyB);
  });
});

describe("checkRateLimitKeyed — basic behaviour", () => {
  it("allows requests up to maxRequests within the window", () => {
    const cfg = { windowMs: 60_000, maxRequests: 3 };
    expect(checkRateLimitKeyed("test-key", cfg)).toBe(true);
    expect(checkRateLimitKeyed("test-key", cfg)).toBe(true);
    expect(checkRateLimitKeyed("test-key", cfg)).toBe(true);
  });

  it("blocks the request at maxRequests + 1", () => {
    const cfg = { windowMs: 60_000, maxRequests: 3 };
    checkRateLimitKeyed("test-key", cfg); // 1
    checkRateLimitKeyed("test-key", cfg); // 2
    checkRateLimitKeyed("test-key", cfg); // 3 — consumed
    expect(checkRateLimitKeyed("test-key", cfg)).toBe(false); // 4 — blocked
  });

  it("is scoped per key — different keys do not share limits", () => {
    const cfg = { windowMs: 60_000, maxRequests: 1 };
    checkRateLimitKeyed("key-A", cfg); // uses up key-A's 1 request
    // key-B should still be allowed
    expect(checkRateLimitKeyed("key-B", cfg)).toBe(true);
  });
});

describe("JOIN_LIMIT preset (F-02)", () => {
  it("allows up to 5 joins per window", () => {
    const key = "1.2.3.4:MYCODE";
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimitKeyed(key, JOIN_LIMIT)).toBe(true);
    }
  });

  it("blocks the 6th join from the same IP+code within the window", () => {
    const key = "1.2.3.4:MYCODE";
    for (let i = 0; i < 5; i++) {
      checkRateLimitKeyed(key, JOIN_LIMIT);
    }
    expect(checkRateLimitKeyed(key, JOIN_LIMIT)).toBe(false);
  });

  it("allows joins to a different code from the same IP (scoped per code)", () => {
    const keyA = rateLimitKey("1.2.3.4", "CODE_A");
    const keyB = rateLimitKey("1.2.3.4", "CODE_B");
    // Exhaust joins on CODE_A
    for (let i = 0; i < 5; i++) {
      checkRateLimitKeyed(keyA, JOIN_LIMIT);
    }
    // CODE_B should still be accessible
    expect(checkRateLimitKeyed(keyB, JOIN_LIMIT)).toBe(true);
  });
});

describe("WRITE_LIMIT preset (F-02 / F-06)", () => {
  it("allows up to 30 writes per window", () => {
    const key = "10.0.0.1:evt_xyz";
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimitKeyed(key, WRITE_LIMIT)).toBe(true);
    }
  });

  it("blocks the 31st write from the same IP+event", () => {
    const key = "10.0.0.1:evt_xyz";
    for (let i = 0; i < 30; i++) {
      checkRateLimitKeyed(key, WRITE_LIMIT);
    }
    expect(checkRateLimitKeyed(key, WRITE_LIMIT)).toBe(false);
  });
});

describe("legacy checkRateLimit (backwards compat)", () => {
  it("returns true for the first request from an IP", () => {
    expect(checkRateLimit("192.168.1.1")).toBe(true);
  });

  it("still shares state — clearRateLimits resets legacy buckets too", () => {
    // Fill up 120 requests
    for (let i = 0; i < 120; i++) {
      checkRateLimit("legacy-ip");
    }
    expect(checkRateLimit("legacy-ip")).toBe(false);
    clearRateLimits();
    expect(checkRateLimit("legacy-ip")).toBe(true);
  });
});

describe("clearRateLimits (test helper)", () => {
  it("resets the state so previously blocked keys are allowed again", () => {
    const cfg = { windowMs: 60_000, maxRequests: 1 };
    checkRateLimitKeyed("reset-key", cfg);
    checkRateLimitKeyed("reset-key", cfg); // now blocked
    clearRateLimits();
    expect(checkRateLimitKeyed("reset-key", cfg)).toBe(true);
  });
});
