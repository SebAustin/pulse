/**
 * Unit tests for src/lib/auth/hostToken.ts
 *
 * Tests: entropy, hash stability, constant-time compare, URL extraction.
 */

import { describe, it, expect } from "vitest";
import {
  generateHostToken,
  hashToken,
  verifyToken,
  extractHostToken,
} from "../../src/lib/auth/hostToken";

describe("generateHostToken", () => {
  it("generates a non-empty string", () => {
    const token = generateHostToken();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("generates tokens with sufficient length (>= 16 chars for 128-bit entropy)", () => {
    const token = generateHostToken();
    // 16 bytes base64url ≈ 21-22 chars
    expect(token.length).toBeGreaterThanOrEqual(16);
  });

  it("generates unique tokens each call (no repeats in 100 samples)", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateHostToken());
    }
    expect(tokens.size).toBe(100);
  });

  it("contains only URL-safe characters", () => {
    for (let i = 0; i < 20; i++) {
      const token = generateHostToken();
      expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
    }
  });
});

describe("hashToken", () => {
  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = hashToken("test-token");
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it("is deterministic — same input always produces same hash", () => {
    const token = "deterministic-test-token";
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });
});

describe("verifyToken", () => {
  it("returns true when raw token matches stored hash", () => {
    const token = generateHostToken();
    const hash = hashToken(token);
    expect(verifyToken(token, hash)).toBe(true);
  });

  it("returns false for a wrong token", () => {
    const correctToken = generateHostToken();
    const hash = hashToken(correctToken);
    const wrongToken = generateHostToken();
    expect(verifyToken(wrongToken, hash)).toBe(false);
  });

  it("returns false for an empty token", () => {
    const hash = hashToken("real-token");
    expect(verifyToken("", hash)).toBe(false);
  });

  it("returns false for a tampered hash", () => {
    const token = generateHostToken();
    const hash = hashToken(token);
    const tamperedHash = hash.slice(0, 63) + (hash[63] === "0" ? "1" : "0");
    expect(verifyToken(token, tamperedHash)).toBe(false);
  });

  it("is consistent across multiple calls (no state leakage)", () => {
    const token = "stable-token";
    const hash = hashToken(token);
    for (let i = 0; i < 10; i++) {
      expect(verifyToken(token, hash)).toBe(true);
    }
  });
});

describe("extractHostToken", () => {
  it("reads from x-host-token header", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-host-token": "my-token-123" },
    });
    expect(extractHostToken(req)).toBe("my-token-123");
  });

  it("reads from hostToken query param when header is absent", () => {
    const req = new Request(
      "http://localhost/api/test?hostToken=my-token-456"
    );
    expect(extractHostToken(req)).toBe("my-token-456");
  });

  it("prefers header over query param", () => {
    const req = new Request(
      "http://localhost/api/test?hostToken=from-query",
      { headers: { "x-host-token": "from-header" } }
    );
    expect(extractHostToken(req)).toBe("from-header");
  });

  it("returns null when neither source is present", () => {
    const req = new Request("http://localhost/api/test");
    expect(extractHostToken(req)).toBeNull();
  });
});
