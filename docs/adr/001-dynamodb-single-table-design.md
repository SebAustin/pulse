# ADR-001: DynamoDB Single-Table Design

**Status:** Accepted  
**Date:** 2026-06-20

---

## Context

Pulse needs to store: events, join codes, moments (4 types), votes (with dedup), counters, reactions, words, leaderboard scores, participant records, presence items, and ops write-rate buckets. The relationship between these entities is hierarchical — almost everything belongs to an event and is accessed by `eventId`.

The alternatives considered were:

- **One table per entity** (e.g., Events, Votes, Counters as separate tables)
- **Single-table design** (all entities in `Pulse` with composite `pk`/`sk`)

A core hackathon requirement (NFR, SC8) is to demonstrate a deliberate DynamoDB data model.

---

## Decision

Use a **single DynamoDB table** named `Pulse` with `pk` (String) and `sk` (String) as the primary key, plus two GSIs:

- **GSI1** (`gsi1pk`/`gsi1sk`): resolves a join code to an eventId.
- **GSI2** (`gsi2pk`/`gsi2sk`): leaderboard top-N ordered by score descending.

All entity types are differentiated by `sk` prefix: `METADATA`, `MOMENT#`, `VOTE#`, `COUNTER#`, `REACTION#`, `WORD#`, `LB#`, `USER#`, `CONN#`, `OPS#WRITES#`.

`lib/dynamo/keys.ts` is the single source of truth for all key strings. All DynamoDB knowledge lives in `lib/dynamo/` — no handler constructs keys directly.

---

## Consequences

**Positive:**

- Composite `begins_with` queries on a single partition retrieve all counters, votes, words, and presence for an event in one or two round trips.
- `TransactWriteItems` across the vote dedup record and the counter shard is possible because they share the same table and the same partition key — a transaction cannot span tables.
- One consistency domain simplifies the analytics summary: all data for a closed event is readable from a single key range.
- The single table is the center of the judging story — every access pattern is explicit and auditable.

**Negative / trade-offs:**

- Key design discipline is higher: a mistake in `keys.ts` affects every entity. Mitigated by unit tests for every key builder and by the single-source-of-truth policy.
- GSI eventual consistency means a join code written in one transaction may briefly not be visible via GSI1. Mitigated by also writing a base `CODE#<code>` item that can be read directly.
- A very large event writes all entity types to the same partition (`pk = EVENT#<id>`), creating a potential hot partition. Mitigated for counters by write sharding (see ADR-002); presence and ops buckets use TTL and are small.
