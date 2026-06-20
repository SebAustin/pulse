/**
 * Word cloud normalisation and aggregation helpers (A-24).
 *
 * Words are stored as raw lowercased strings (no stemming for MVP).
 * These helpers are used both at write time (normalise) and read time (aggregate).
 *
 * Pure functions — unit-testable.
 */

import type { WordCount } from "../dynamo/types";

/**
 * Normalise a word for storage:
 *  - lowercase
 *  - trim whitespace
 *  - collapse internal whitespace
 *  - max 40 characters (enforced by zod schema upstream, but belts and braces)
 */
export function normaliseWord(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, " ").slice(0, 40);
}

/**
 * Aggregate a flat array of word strings into sorted word-count pairs.
 * Returns descending by count, then alphabetically for stable tie-breaking.
 */
export function aggregateWords(words: string[]): WordCount[] {
  const freq: Record<string, number> = {};
  for (const raw of words) {
    const w = normaliseWord(raw);
    if (w) freq[w] = (freq[w] ?? 0) + 1;
  }
  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

/**
 * Return the top-N entries from an already-sorted word count array.
 */
export function topN(words: WordCount[], n: number): WordCount[] {
  return words.slice(0, n);
}
