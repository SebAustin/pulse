# ADR-003: SSE + Polling Fallback vs WebSockets for MVP Real-Time

**Status:** Accepted  
**Date:** 2026-06-20

---

## Context

Pulse needs to push aggregated vote tallies, leaderboard updates, and event state changes to all connected clients within ~1 s. The main options are:

1. **WebSockets** — bidirectional, persistent, requires a stateful broadcast layer (Ably, Pusher, or a custom server); adds infra cost and complexity.
2. **Server-Sent Events (SSE)** — unidirectional (server → client), native to Next.js Route Handlers on Vercel, no extra service.
3. **HTTP polling** — simplest, but high latency and wasted requests when nothing changes.

The real-time contract is server-to-client aggregate push (vote tallies, leaderboard scores). There is no client-to-server message that requires the SSE channel — all mutations go through separate POST handlers.

---

## Decision

Use **SSE as the primary transport** and **HTTP polling as the automatic fallback**:

- **SSE** (`GET /api/stream/[eventId]`, `runtime='nodejs'`, `maxDuration=300`): emits a full JSON snapshot every `SSE_INTERVAL_MS` (default 1 000 ms) as a named `snapshot` event. Each snapshot includes the full current state — reconnects are idempotent, no replay needed. A heartbeat comment (`:hb`) is emitted every ~10 s to keep intermediaries from closing idle connections.
- **Polling fallback**: `GET /api/stream/[eventId]?once=1` returns a single snapshot. `useLiveSnapshot` switches to this at `POLL_INTERVAL_MS` (3 000 ms) if SSE fails to recover.
- The SSE micro-cache (`lib/sse/snapshot-cache.ts`, TTL = `SSE_CACHE_TTL_MS` = 500 ms) deduplicates DynamoDB reads across multiple SSE connections sharing the same warm Vercel instance.

The **DynamoDB Streams → Lambda → API Gateway WebSocket** scale-out path is fully documented (PLAN.md §5.3, DEPLOYMENT.md §12, ARCHITECTURE.md §9) and the table already emits stream events. It is not provisioned for MVP because SSE covers the demo scenario (≤ 1 000 concurrent connections per event per Vercel function instance).

---

## Consequences

**Positive:**

- No additional infrastructure or third-party service for MVP.
- SSE is natively supported by Next.js App Router Route Handlers; `ReadableStream` + `Content-Type: text/event-stream` is all that is needed.
- Full-state snapshots make reconnects and the polling fallback trivially correct.
- The `useLiveSnapshot` hook exposes a uniform `{ snapshot, transport, connected }` interface — components are transport-agnostic, and switching to WebSocket requires only adding a branch in the hook.

**Negative / trade-offs:**

- The SSE fan-out ceiling is ~1 000 concurrent connections per event per warm Vercel function instance (assumption A-20). For millions of concurrent viewers, the Streams path must be wired.
- `maxDuration=300` limits SSE streams to 5 minutes on Vercel; clients reconnect automatically and receive a fresh full snapshot.
- The in-process micro-cache provides deduplication only within a single warm instance. Multiple warm instances each compute their own snapshot. At MVP scale, this is acceptable; at scale the Streams path consolidates this.
- Vercel Hobby tier does not support `maxDuration > 60 s`. SSE works correctly on Pro/Enterprise tier or with the polling fallback on Hobby.
