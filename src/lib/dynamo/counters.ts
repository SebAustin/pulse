/**
 * Sharded counter logic for Pulse.
 *
 * Every high-cardinality counter (poll option, emoji, trivia option) is split
 * across SHARD_COUNT shards to prevent hot-partition throttling under burst
 * writes (NFR-01.4, A-09, SC4, SC5).
 *
 * Write path: pick one shard deterministically from participantId, then
 *   UpdateItem ADD :one on that shard's sk.
 * Read path: Query all shards for a (momentId, optionKey) prefix, then sum
 *   in the application layer (NFR-01.5, A-10).
 *
 * Pure helpers (pickShard, collapseShards) have no SDK imports — unit-testable.
 */

import { BatchGetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { TABLE_NAME, getDocClient } from "./client";
import { counterPrefix, counterShardKey, counterShardSk } from "./keys";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum shard count per the spec (NFR-01.4). Env-tunable upward. */
export const SHARD_COUNT: number = (() => {
  const n = parseInt(process.env.SHARD_COUNT ?? "10", 10);
  if (isNaN(n) || n < 10) return 10;
  return n;
})();

// ---------------------------------------------------------------------------
// Pure helpers (no SDK — fully unit-testable)
// ---------------------------------------------------------------------------

/**
 * Pick a shard index for a given writer key (participantId).
 * Uses a simple djb2-style hash for deterministic but well-distributed spread.
 * The same participantId always lands on the same shard, which is fine because
 * the dedup record prevents them from writing a second time anyway.
 */
export function pickShard(participantId: string, shardCount: number = SHARD_COUNT): number {
  let hash = 5381;
  for (let i = 0; i < participantId.length; i++) {
    hash = ((hash << 5) + hash) ^ participantId.charCodeAt(i);
    hash = hash >>> 0; // keep as unsigned 32-bit
  }
  return hash % shardCount;
}

/**
 * Collapse an array of {sk, count} records returned by a counter Query
 * into a Tally map: { [optionKey]: totalCount }.
 *
 * sk format: COUNTER#<momentId>#<optionKey>#<shard>
 * We extract optionKey by stripping the COUNTER#<momentId># prefix and
 * the trailing #<shard>.
 */
export function collapseShards(
  items: Array<{ sk: string; count: number }>,
  momentId: string
): Record<string, number> {
  const prefix = `COUNTER#${momentId}#`;
  const tally: Record<string, number> = {};

  for (const { sk, count } of items) {
    if (!sk.startsWith(prefix)) continue;
    const rest = sk.slice(prefix.length); // "<optionKey>#<shard>"
    const lastHash = rest.lastIndexOf("#");
    if (lastHash === -1) continue;
    const optionKey = rest.slice(0, lastHash);
    tally[optionKey] = (tally[optionKey] ?? 0) + count;
  }

  return tally;
}

// ---------------------------------------------------------------------------
// SDK-backed counter operations
// ---------------------------------------------------------------------------

/**
 * Read all counter shards for a specific (eventId, momentId, optionKey)
 * combination and return the summed total.
 *
 * Uses a single Query with begins_with to fetch all shards in one round-trip
 * (or a few pages if there are many shards).
 */
export async function readCounterTotal(
  eventId: string,
  momentId: string,
  optionKey: string
): Promise<number> {
  const client = getDocClient();
  // Build precise prefix: COUNTER#<momentId>#<optionKey>#
  const shardPrefix = `COUNTER#${momentId}#${optionKey}#`;

  const { Items = [] } = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${eventId}`,
        ":prefix": shardPrefix,
      },
      ProjectionExpression: "sk, #cnt",
      ExpressionAttributeNames: { "#cnt": "count" },
    })
  );

  return (Items as Array<{ sk: string; count: number }>).reduce(
    (sum, item) => sum + (item.count ?? 0),
    0
  );
}

/**
 * Read all counter shards for a moment (all options) in one Query,
 * then collapse to a Tally.
 */
export async function readMomentTallies(
  eventId: string,
  momentId: string
): Promise<Record<string, number>> {
  const client = getDocClient();

  const { Items = [] } = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `EVENT#${eventId}`,
        ":prefix": counterPrefix(momentId),
      },
      ProjectionExpression: "sk, #cnt",
      ExpressionAttributeNames: { "#cnt": "count" },
    })
  );

  return collapseShards(
    Items as Array<{ sk: string; count: number }>,
    momentId
  );
}

/**
 * BatchGet all shards for a fixed set of (momentId, optionKey) pairs.
 * Used when the option list is known (e.g., poll with defined options).
 *
 * More efficient than a Query when SHARD_COUNT is small and option count is
 * small, because it generates exactly shardCount * optionCount requests in one
 * BatchGetItem call (max 100 items per call).
 */
export async function batchReadCounterTotals(
  eventId: string,
  momentId: string,
  optionKeys: string[]
): Promise<Record<string, number>> {
  if (optionKeys.length === 0) return {};
  const pk = `EVENT#${eventId}`;
  const keys: Array<{ pk: string; sk: string }> = [];
  for (const optionKey of optionKeys) {
    for (let shard = 0; shard < SHARD_COUNT; shard++) {
      keys.push({ pk, sk: counterShardSk(momentId, optionKey, shard) });
    }
  }

  const client = getDocClient();
  const tally: Record<string, number> = {};

  // BatchGetItem has a 100-item limit per request.
  for (let offset = 0; offset < keys.length; offset += 100) {
    const batch = keys.slice(offset, offset + 100);
    const { Responses } = await client.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE_NAME]: { Keys: batch },
        },
      })
    );

    const items = (Responses?.[TABLE_NAME] ?? []) as Array<{
      sk: string;
      count: number;
    }>;
    for (const item of items) {
      const collapsed = collapseShards([item], momentId);
      for (const [k, v] of Object.entries(collapsed)) {
        tally[k] = (tally[k] ?? 0) + v;
      }
    }
  }

  // Ensure every requested option key appears (with 0 if no writes yet)
  for (const optionKey of optionKeys) {
    if (!(optionKey in tally)) tally[optionKey] = 0;
  }

  return tally;
}

/**
 * Produce a shard-keys list for a given counter item (used in TransactWrite).
 * Returns the pk/sk for the chosen shard.
 */
export function counterShardTarget(
  eventId: string,
  momentId: string,
  optionKey: string,
  participantId: string
): { pk: string; sk: string; shard: number } {
  const shard = pickShard(participantId);
  const { pk, sk } = counterShardKey(eventId, momentId, optionKey, shard);
  return { pk, sk, shard };
}
