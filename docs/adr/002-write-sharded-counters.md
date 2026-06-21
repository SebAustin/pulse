# ADR-002: Write-Sharded Counters for Hot-Partition Mitigation

**Status:** Accepted  
**Date:** 2026-06-20

---

## Context

A poll option receiving 5 000 votes per second against a single-item DynamoDB counter would hit the per-partition write ceiling (~1 000 WCU/s per key) and cause `ProvisionedThroughputExceededException` (even on PAY_PER_REQUEST, which applies an adaptive capacity ceiling). This is exactly the Track 3 load scenario.

Alternatives considered:

1. **Single counter item** — simple, but hot-partition throttling under burst writes.
2. **Count VOTE# dedup items on read** — O(votes) reads on every snapshot tick; untenable for large events.
3. **Write-sharded counters** — distribute writes across N counter items, collapse on read.

---

## Decision

Every high-cardinality counter (poll option, emoji emoji-type, trivia option) is split across `SHARD_COUNT` shards (minimum 10, env-tunable via `SHARD_COUNT`).

Write path (`lib/dynamo/counters.ts: pickShard`):

- Shard index = `djb2_hash(participantId) % SHARD_COUNT`
- Item key: `pk = EVENT#<id>`, `sk = COUNTER#<momentId>#<optionKey>#<shard>`
- Operation: `UpdateItem ADD count :1`

Read path (`collapseShards`):

- `Query begins_with(sk, 'COUNTER#<momentId>#')` returns all shards for all options in one call.
- Application layer sums `count` per `optionKey`.

The write and the dedup record are part of the same `TransactWriteItems` (see ADR-003).

At `SHARD_COUNT = 10`, a 5 000 write/s burst distributes to ~500 writes/s per shard — well below DynamoDB's ~1 000 WCU/s per-partition limit. The load test (`npm run loadtest`) verifies zero `ThrottledRequests` at this load.

---

## Consequences

**Positive:**

- Verified zero throttling under 5 000 concurrent writes in the load test.
- `SHARD_COUNT` is env-tunable upward without code changes.
- Read fan-out is O(options × shards): for 4 options × 10 shards = 40 items — negligible.
- The design maps directly to the OpsReadout shard-activity visualization — the sharding is visible and explainable to judges.

**Negative / trade-offs:**

- Counter reads are slightly more expensive: one Query returns 40–60 items instead of 6. Mitigated by the SSE micro-cache (500 ms TTL) which deduplicates reads across SSE connections on the same warm instance.
- Shard assignment is deterministic per `participantId` — the same participant always hits the same shard. This is acceptable because the dedup record prevents them from writing a second time, so there is no inequality in shard load from the same participant.
- `BatchGetItem` is available (`batchReadCounterTotals`) when the option list is known, providing a more targeted alternative to Query.
