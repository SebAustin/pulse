/**
 * Unit tests for src/lib/dynamo/counters.ts
 *
 * Tests: shard pick distribution, collapseShards correctness.
 * No SDK imports — all pure helpers.
 */

import { describe, it, expect } from "vitest";
import { pickShard, collapseShards, SHARD_COUNT } from "../../src/lib/dynamo/counters";

describe("SHARD_COUNT", () => {
  it("is at least 10 (NFR-01.4)", () => {
    expect(SHARD_COUNT).toBeGreaterThanOrEqual(10);
  });
});

describe("pickShard", () => {
  it("returns a value in [0, shardCount)", () => {
    for (let i = 0; i < 100; i++) {
      const shard = pickShard(`u_${i}`, 10);
      expect(shard).toBeGreaterThanOrEqual(0);
      expect(shard).toBeLessThan(10);
    }
  });

  it("is deterministic — same input always returns same shard", () => {
    const id = "u_deterministic_123";
    const shard1 = pickShard(id, 10);
    const shard2 = pickShard(id, 10);
    expect(shard1).toBe(shard2);
  });

  it("distributes 1000 IDs across all 10 shards (no dead shards)", () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 1000; i++) {
      const shard = pickShard(`u_user_${i}`, 10);
      counts[shard]++;
    }
    // Every shard should get at least some hits in 1000 trials
    for (const count of counts) {
      expect(count).toBeGreaterThan(0);
    }
  });

  it("distributes reasonably evenly (no shard >30% of total)", () => {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 1000; i++) {
      const shard = pickShard(`participant_${i}_session_${Math.random()}`, 10);
      counts[shard]++;
    }
    const maxHits = Math.max(...counts);
    expect(maxHits).toBeLessThan(300); // <30% of 1000
  });

  it("works correctly with different shardCount values", () => {
    const shard16 = pickShard("u_abc", 16);
    expect(shard16).toBeGreaterThanOrEqual(0);
    expect(shard16).toBeLessThan(16);
  });
});

describe("collapseShards", () => {
  const momentId = "m_testmoment";

  it("sums counts across shards for the same option", () => {
    const items = [
      { sk: `COUNTER#${momentId}#optA#0`, count: 10 },
      { sk: `COUNTER#${momentId}#optA#1`, count: 5 },
      { sk: `COUNTER#${momentId}#optA#2`, count: 3 },
    ];
    const tally = collapseShards(items, momentId);
    expect(tally["optA"]).toBe(18);
  });

  it("handles multiple options independently", () => {
    const items = [
      { sk: `COUNTER#${momentId}#optA#0`, count: 10 },
      { sk: `COUNTER#${momentId}#optA#1`, count: 5 },
      { sk: `COUNTER#${momentId}#optB#0`, count: 20 },
      { sk: `COUNTER#${momentId}#optB#1`, count: 7 },
    ];
    const tally = collapseShards(items, momentId);
    expect(tally["optA"]).toBe(15);
    expect(tally["optB"]).toBe(27);
  });

  it("returns 0 for options with no items", () => {
    const tally = collapseShards([], momentId);
    expect(Object.keys(tally).length).toBe(0);
  });

  it("ignores items from a different momentId", () => {
    const items = [
      { sk: `COUNTER#${momentId}#optA#0`, count: 10 },
      { sk: `COUNTER#other_moment#optA#0`, count: 999 },
    ];
    const tally = collapseShards(items, momentId);
    expect(tally["optA"]).toBe(10);
  });

  it("handles shard 0 through 9 correctly", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      sk: `COUNTER#${momentId}#optA#${i}`,
      count: i + 1, // 1..10
    }));
    const tally = collapseShards(items, momentId);
    // Sum of 1+2+...+10 = 55
    expect(tally["optA"]).toBe(55);
  });

  it("handles option keys with special characters", () => {
    const items = [
      { sk: `COUNTER#${momentId}#🔥#0`, count: 42 },
      { sk: `COUNTER#${momentId}#🔥#1`, count: 8 },
    ];
    const tally = collapseShards(items, momentId);
    expect(tally["🔥"]).toBe(50);
  });

  it("correctly handles option keys that contain # (e.g., complex option names)", () => {
    // optionKey = "A#B" would break naive parsing — verify lastIndexOf is used
    // This tests the robustness of the parsing strategy
    const items = [
      { sk: `COUNTER#${momentId}#A#B#0`, count: 5 },
    ];
    const tally = collapseShards(items, momentId);
    // optionKey should be "A#B"
    expect(tally["A#B"]).toBe(5);
  });

  it("N votes spread across shards sum to exactly N", () => {
    const N = 143;
    // Simulate N votes distributed across 10 shards
    const counts = new Array(10).fill(0);
    for (let i = 0; i < N; i++) {
      const shard = pickShard(`u_${i}`, 10);
      counts[shard]++;
    }

    const items = counts.map((count, shard) => ({
      sk: `COUNTER#${momentId}#optA#${shard}`,
      count,
    }));

    const tally = collapseShards(items, momentId);
    expect(tally["optA"]).toBe(N);
  });
});
