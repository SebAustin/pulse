/**
 * Unit tests for src/lib/moment/wordcloud.ts
 *
 * Tests: normalisation, aggregation, top-N.
 */

import { describe, it, expect } from "vitest";
import { normaliseWord, aggregateWords, topN } from "../../src/lib/moment/wordcloud";

describe("normaliseWord", () => {
  it("lowercases the input", () => {
    expect(normaliseWord("DynamoDB")).toBe("dynamodb");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normaliseWord("  hello  ")).toBe("hello");
  });

  it("collapses internal whitespace", () => {
    expect(normaliseWord("word   cloud")).toBe("word cloud");
  });

  it("truncates to 40 characters", () => {
    const long = "a".repeat(50);
    expect(normaliseWord(long)).toHaveLength(40);
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normaliseWord("   ")).toBe("");
  });

  it("is idempotent", () => {
    const word = "hello world";
    expect(normaliseWord(normaliseWord(word))).toBe(normaliseWord(word));
  });
});

describe("aggregateWords", () => {
  it("counts word frequencies", () => {
    const result = aggregateWords(["cat", "dog", "cat", "cat", "dog"]);
    expect(result).toEqual([
      { word: "cat", count: 3 },
      { word: "dog", count: 2 },
    ]);
  });

  it("normalises words before counting", () => {
    const result = aggregateWords(["Hello", "HELLO", "hello"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ word: "hello", count: 3 });
  });

  it("sorts by frequency descending", () => {
    const result = aggregateWords(["b", "a", "a", "a", "b", "c"]);
    expect(result[0].word).toBe("a");
    expect(result[1].word).toBe("b");
    expect(result[2].word).toBe("c");
  });

  it("uses alphabetical order for ties", () => {
    const result = aggregateWords(["banana", "apple", "apple", "banana"]);
    // Both have count 2; alphabetical: apple < banana
    expect(result[0].word).toBe("apple");
    expect(result[1].word).toBe("banana");
  });

  it("filters out empty strings after normalisation", () => {
    const result = aggregateWords(["  ", "hello", "\t"]);
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe("hello");
  });

  it("returns empty array for empty input", () => {
    expect(aggregateWords([])).toEqual([]);
  });
});

describe("topN", () => {
  const words = [
    { word: "alpha", count: 100 },
    { word: "beta", count: 80 },
    { word: "gamma", count: 60 },
    { word: "delta", count: 40 },
    { word: "epsilon", count: 20 },
  ];

  it("returns the first N entries", () => {
    expect(topN(words, 3)).toHaveLength(3);
    expect(topN(words, 3)[0].word).toBe("alpha");
  });

  it("returns all when N >= length", () => {
    expect(topN(words, 10)).toHaveLength(5);
  });

  it("returns empty for N=0", () => {
    expect(topN(words, 0)).toHaveLength(0);
  });
});
