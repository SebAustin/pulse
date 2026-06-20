/**
 * Server-authoritative trivia scoring (PLAN §4.5, A-23, defect 3).
 *
 * Formula: base_points * (remaining / timeLimitSec) rounded to nearest integer.
 * Both endpoints are server-controlled; no client timestamp is trusted.
 *
 * Pure function — no side effects, fully unit-testable.
 */

import { config } from "../config";

/**
 * Compute the points awarded for a trivia answer.
 *
 * @param activatedAt   - epoch ms when the moment was launched (server-stamped)
 * @param serverReceiveTs - epoch ms when the server received this answer
 * @param timeLimitSec  - the moment's configured time limit
 * @param isCorrect     - whether the chosen option matches correctIndex
 * @returns points awarded (0 for wrong answers or expired answers)
 */
export function computeTriviaScore(
  activatedAt: number,
  serverReceiveTs: number,
  timeLimitSec: number,
  isCorrect: boolean
): number {
  if (!isCorrect) return 0;

  const elapsedSec = (serverReceiveTs - activatedAt) / 1000;
  const remaining = Math.max(0, timeLimitSec - elapsedSec);
  const clamped = Math.min(remaining, timeLimitSec);

  return Math.round(config.BASE_POINTS * (clamped / timeLimitSec));
}

/**
 * Determine if a trivia answer arrived within the allowed grace window.
 * Answers arriving after timeLimitSec + GRACE_MS may be rejected with 410.
 */
export function isTriviaAnswerTimely(
  activatedAt: number,
  serverReceiveTs: number,
  timeLimitSec: number
): boolean {
  const elapsedMs = serverReceiveTs - activatedAt;
  const limitMs = timeLimitSec * 1000 + config.TRIVIA_GRACE_MS;
  return elapsedMs <= limitMs;
}
