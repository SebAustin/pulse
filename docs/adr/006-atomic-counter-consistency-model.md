# ADR-006: Atomic Counter + SSE Eventual Consistency Model

**Status:** Accepted  
**Date:** 2026-06-20

---

## Context

Pulse needs two consistency guarantees that are in tension:

1. **Vote integrity** — a participant must never be able to vote twice, and every accepted vote must be counted exactly once. This requires strong consistency on the write path.
2. **Live tally updates** — every connected client should see an updated count within ~1 s of a vote being cast. This is a real-time requirement that is delivered best-effort.

The question is: what is the consistency model exposed to clients, and what are its boundaries?

---

## Decision

**Write path: strongly consistent.**

The vote dedup `Put` (with `ConditionExpression: attribute_not_exists(sk)`) and the counter shard `ADD` are inside a single `TransactWriteItems`. DynamoDB transactions are serializable — if the transaction succeeds, both writes are committed and visible on subsequent strongly consistent reads. If the condition fails (duplicate), the entire transaction rolls back — the counter is never incremented for a duplicate vote. This satisfies the vote integrity requirement unconditionally.

**Read path: eventually consistent by design.**

The SSE snapshot handler reads counter shards via `Query` (which defaults to eventually consistent reads in DynamoDB). The in-process micro-cache (500 ms TTL) adds an additional staleness window. As a result:

- A client may see a tally that is up to ~1.5 s stale (500 ms cache + time to next SSE tick + DynamoDB propagation) — within the < 2 s latency budget.
- Two clients on different warm Vercel instances may briefly see different tallies.
- A vote that has been accepted (202) may not appear in the tally for up to ~1 s on the same client.

**Summary reads: strongly consistent.**

The analytics summary (`GET /api/summary/[eventId]`) uses strongly consistent reads (`ConsistentRead: true`) for event metadata, participant counts, and counter totals — the summary must be accurate, not approximate.

**Trivia scoring: server-authoritative.**

Trivia timing is computed from the moment's `activatedAt` (server clock at launch) and `Date.now()` at the server at vote receipt. No client timestamp is trusted. Late answers clamp to 0 points. This is enforced in `lib/moment/scoring.ts`.

---

## Consequences

**Positive:**

- Vote integrity (no double-vote, exact tally) is guaranteed at the database level, independent of network conditions, client retries, or race conditions.
- The eventual-consistent SSE read path enables the micro-cache, which is critical for bounding DynamoDB read amplification when many SSE connections share a warm instance.
- The consistency model is explicit and documented — operators know what is and is not guaranteed.

**Negative / trade-offs:**

- A participant who votes and immediately observes the tally on the same screen may see their vote "missing" for up to ~1 s (their accepted vote is in DynamoDB, but the next snapshot may read an eventually consistent replica that doesn't yet reflect it). This is an expected and documented UX property.
- The micro-cache means two clients on the same Vercel instance see the same snapshot; clients on different instances may diverge by up to `SSE_CACHE_TTL_MS`. At hackathon scale this is imperceptible; at million-scale the Streams path eliminates the divergence.
- `ConsistentRead: true` on summary reads consumes 2× RCU per item compared to eventually consistent reads. At summary time (post-event, infrequent) this is inconsequential.
