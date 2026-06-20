/**
 * Unit tests for src/lib/moment/scoring.ts
 *
 * Tests server-authoritative trivia scoring formula for all boundary cases.
 * PLAN §4.5, A-23, defect 3.
 */

import { describe, it, expect } from "vitest";
import { computeTriviaScore, isTriviaAnswerTimely } from "../../src/lib/moment/scoring";

const BASE_POINTS = 1000; // matches config.BASE_POINTS

describe("computeTriviaScore", () => {
  const timeLimitSec = 30;
  const activatedAt = 1_000_000_000; // fixed reference

  it("awards full points for an immediate correct answer (remaining = full)", () => {
    // Answer arrives at exactly activatedAt (0 elapsed)
    const score = computeTriviaScore(activatedAt, activatedAt, timeLimitSec, true);
    expect(score).toBe(BASE_POINTS); // 1000 * 30/30 = 1000
  });

  it("awards half points for a correct answer at half the time limit", () => {
    const serverReceiveTs = activatedAt + (timeLimitSec / 2) * 1000; // 15s elapsed
    const score = computeTriviaScore(activatedAt, serverReceiveTs, timeLimitSec, true);
    expect(score).toBe(500); // 1000 * 15/30 = 500
  });

  it("awards zero points for a correct answer exactly at the time limit", () => {
    const serverReceiveTs = activatedAt + timeLimitSec * 1000; // 30s elapsed
    const score = computeTriviaScore(activatedAt, serverReceiveTs, timeLimitSec, true);
    expect(score).toBe(0); // remaining = 0
  });

  it("awards zero points for a correct answer past the time limit (remaining clamped to 0)", () => {
    const serverReceiveTs = activatedAt + (timeLimitSec + 5) * 1000; // 35s elapsed
    const score = computeTriviaScore(activatedAt, serverReceiveTs, timeLimitSec, true);
    expect(score).toBe(0);
  });

  it("awards zero points for a WRONG answer regardless of speed", () => {
    // Fast but incorrect
    const score = computeTriviaScore(activatedAt, activatedAt + 1000, timeLimitSec, false);
    expect(score).toBe(0);
  });

  it("awards zero points for a wrong answer at full speed", () => {
    const score = computeTriviaScore(activatedAt, activatedAt, timeLimitSec, false);
    expect(score).toBe(0);
  });

  it("rounds to nearest integer", () => {
    // 1000 * (29.5 / 30) = 983.33... → rounds to 983
    const serverReceiveTs = activatedAt + 0.5 * 1000; // 0.5s elapsed, remaining = 29.5
    const score = computeTriviaScore(activatedAt, serverReceiveTs, timeLimitSec, true);
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBe(983); // round(1000 * 29.5/30)
  });

  it("handles timeLimitSec = 10 (minimum)", () => {
    const limit = 10;
    // Answer at 5s
    const serverReceiveTs = activatedAt + 5000;
    const score = computeTriviaScore(activatedAt, serverReceiveTs, limit, true);
    expect(score).toBe(500); // 1000 * 5/10
  });

  it("handles timeLimitSec = 60 (maximum)", () => {
    const limit = 60;
    // Answer at 30s
    const serverReceiveTs = activatedAt + 30000;
    const score = computeTriviaScore(activatedAt, serverReceiveTs, limit, true);
    expect(score).toBe(500); // 1000 * 30/60
  });

  it("never returns negative points", () => {
    // Wildly late answer
    const serverReceiveTs = activatedAt + 1_000_000;
    const score = computeTriviaScore(activatedAt, serverReceiveTs, timeLimitSec, true);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("never returns more than BASE_POINTS", () => {
    // Exactly at activation (best possible)
    const score = computeTriviaScore(activatedAt, activatedAt, timeLimitSec, true);
    expect(score).toBeLessThanOrEqual(BASE_POINTS);
  });
});

describe("isTriviaAnswerTimely", () => {
  const activatedAt = 1_000_000_000;
  const timeLimitSec = 30;
  const GRACE_MS = 2000; // from config

  it("accepts an answer within the time limit", () => {
    const ts = activatedAt + 25 * 1000; // 25s
    expect(isTriviaAnswerTimely(activatedAt, ts, timeLimitSec)).toBe(true);
  });

  it("accepts an answer exactly at the time limit", () => {
    const ts = activatedAt + timeLimitSec * 1000;
    expect(isTriviaAnswerTimely(activatedAt, ts, timeLimitSec)).toBe(true);
  });

  it("accepts an answer within the grace period after the limit", () => {
    const ts = activatedAt + timeLimitSec * 1000 + GRACE_MS - 1;
    expect(isTriviaAnswerTimely(activatedAt, ts, timeLimitSec)).toBe(true);
  });

  it("rejects an answer beyond the grace period", () => {
    const ts = activatedAt + timeLimitSec * 1000 + GRACE_MS + 100;
    expect(isTriviaAnswerTimely(activatedAt, ts, timeLimitSec)).toBe(false);
  });
});
