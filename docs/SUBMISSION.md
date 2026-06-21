# Pulse — Hackathon Submission Kit

> Track: 3 — Million-scale global app
> Hackathon: H0: Hack the Zero Stack with Vercel, v0 and AWS Databases
> Deadline: 2026-06-29

---

## Devpost Submission Text

Copy each section below directly into the Devpost form.

---

### Project name

Pulse

---

### Tagline

Real-time audience engagement that scales to a million — the database is the show.

---

### What it does

Pulse lets a host create a live event in seconds and share a 6-character join code. Audience members join anonymously (display name only, no account) from any browser — phone, tablet, desktop. The host launches interactive moments: multiple-choice polls, word clouds, emoji reaction bursts, trivia questions with countdowns and a live leaderboard. Every connected screen sees aggregated results update within approximately 1 second.

The host console includes a LIVE OPS panel showing writes per second, participant count, SSE subscriber count, and animated shard-activity dots — a designed feature that makes the underlying DynamoDB architecture visible and legible to anyone watching.

When the event ends, the host receives a stable analytics summary: unique participants, total interactions, peak concurrent audience, and top words per word cloud. All backed by durable DynamoDB items with per-item-type TTL — nothing expires during the judging window.

---

### The problem and who it's for

Live events — conference talks, streams, classrooms, company all-hands — are one-way by default. The speaker has no signal on whether the audience is following, excited, or checked out. Existing tools (Mentimeter, Slido, Kahoot) require audience accounts, take minutes to configure, and return results that arrive too late to react to on-air.

**The audience:** Streamers, teachers, conference speakers, and event organizers running live sessions with remote or in-person audiences ranging from 10 to 100,000 people.

**The problem, precisely:** Getting real-time audience feedback requires a tool that takes seconds to set up, requires zero friction to join, and returns results fast enough to react to in the moment. It also needs to hold up at scale — not just for small demos, but for the kind of audience size a popular streamer or large conference produces.

---

### AWS database used: Amazon DynamoDB

**Why DynamoDB — the technical case**

Every interesting property of Pulse maps directly to a DynamoDB design decision:

| Requirement | DynamoDB capability |
|-------------|---------------------|
| No double votes, exact tally | `TransactWriteItems` — conditional vote dedup `Put` (with `attribute_not_exists(sk)`) + counter shard `ADD` in a single atomic operation |
| 5,000+ writes/s to one event without throttling | Write-sharded counters (10 shards per poll option, env-tunable via `SHARD_COUNT`), load-tested: 5,000 accepted / 0 lost / 0 throttled |
| Top-N leaderboard without a table scan | GSI2 `Query ScanIndexForward=false Limit=N` — O(N), no `ScanCommand` anywhere in the codebase |
| Analytics that survive the judging window | Per-item-type TTL policy — durable items (EVENT, COUNTER, LB, USER, WORD) carry no `ttl` attribute |
| Scale-out path to millions of concurrent viewers | DynamoDB Streams already enabled; Lambda → API Gateway WebSocket fan-out is documented and ready to wire |
| Zero operational overhead at MVP scale | `PAY_PER_REQUEST` — no capacity planning, no pre-warming, no throttling under normal load |

**The hero moment:** a single `TransactWriteItems` call fuses a conditional `Put` (with `attribute_not_exists(sk)` — prevents re-voting) and a counter shard `ADD` into one atomic round trip. A vote and its tally can never diverge — this is a database guarantee, not application logic.

**The single-table design:** one DynamoDB table named `Pulse`, composite `pk`/`sk` keys, two GSIs, per-item-type TTL, on-demand billing, and Streams enabled. All 23 access patterns in the data model map to explicit DynamoDB operations. No `ScanCommand` anywhere.

**Why not Redis or relational?** A relational database requires a separate table per entity and a JOIN for every snapshot read. Redis counters can give you fast increments but cannot fuse a conditional idempotency check and a counter increment into a single atomic operation. DynamoDB's `TransactWriteItems` is uniquely suited to the vote-dedup + counter-increment pattern. That is why DynamoDB is the center of this product, not an implementation detail.

---

### How we built it

**Stack:**
- Next.js 16 (App Router, TypeScript strict) deployed on Vercel
- Amazon DynamoDB — single table (`Pulse`), `PAY_PER_REQUEST`, two GSIs (`GSI1` for join-code lookup, `GSI2` for leaderboard), Streams enabled, TTL
- Server-Sent Events via Next.js Route Handlers (`runtime=nodejs`, `maxDuration=300`) + HTTP polling fallback for resilience
- Vercel OIDC (`AssumeRoleWithWebIdentity`) — zero stored AWS keys; short-lived credentials scoped to the one table and its GSIs
- AWS CDK v2 (TypeScript) for infrastructure provisioning; deploy is confirmation-gated
- Vitest for unit and integration tests (integration suite runs against DynamoDB Local via Docker); Playwright for E2E tests

**Key implementation decisions:**

`lib/dynamo/keys.ts` is the single source of truth for all `pk`/`sk`/GSI key construction. It is a pure module, fully unit-tested, and every repository function goes through it. This discipline kept the single-table design coherent across 23 access patterns.

Vote dedup uses `attribute_not_exists(sk)` on a dedicated `VOTE#<participantId>#<momentId>` item inside a `TransactWriteItems` call. The dedup record and the counter increment are atomic — there is no read-check-write race.

Write-sharding uses a deterministic djb2 hash on `participantId` to assign each vote to one of 10 shard items. The same participant always hits the same shard, which is harmless given the dedup record prevents revoting. Shard reads collapse in a single `Query` returning at most 10 items (4 options × 10 shards = 40 items for a 4-option poll).

The LIVE OPS panel (`/api/events/[eventId]/ops`) exposes live writes/s, participant count, SSE subscriber count, and shard-dot activity to the host console. It is a designed feature, not a debug view. It makes the database's work legible.

Host authentication uses capability-URL redemption: the `hostToken` in the initial URL is consumed by Edge middleware on first visit, written into an httpOnly SameSite=Strict cookie, and the middleware 307-redirects to the tokenless URL. The token never persists in browser history and is never exposed to client-side JavaScript.

---

### Why DynamoDB / how it maps to Track 3 (million-scale)

- **Write path:** 5,000+ writes/s to a single hot event via 10 write-sharded counters per option. Each shard receives ~500 writes/s — safely below DynamoDB's per-partition ceiling. Load-tested: 5,000 accepted, 0 lost, 0 throttled.
- **Read path:** Shards collapse in O(shards) — 40 DynamoDB items for a 4-option poll, in one `Query`. The tally is always exact (atomic sharded adds).
- **Real-time:** SSE with a 500 ms micro-cache deduplicates DynamoDB reads across concurrent SSE connections. p95 latency measured at ~1.3 s (gate is < 2 s). 30/30 trials passed.
- **Scale-out path:** DynamoDB Streams are enabled on the table. Adding a Lambda consumer feeding an API Gateway WebSocket connection table extends the architecture to millions of concurrent real-time connections. This path is fully documented and ready to wire; it was not built for MVP because SSE handles the hackathon-scale audience cleanly.
- **Zero stored credentials:** Vercel OIDC (`AssumeRoleWithWebIdentity`) — IAM role scoped to the `Pulse` table and its two GSIs only.

---

### Verified results (from ACCEPTANCE.md)

| Test | Result |
|------|--------|
| Unit tests (Vitest) | 137 passing |
| Integration tests (vs DynamoDB Local) | 24 passing |
| E2E tests (Playwright, SC1/SC2/SC3 against prod build) | 3 passing |
| Load test (5,000 concurrent writes) | 0 lost votes, 0 throttled requests |
| p95 latency (vote → second client sees tally) | ~1.3 s (gate < 2 s), 30/30 trials |
| Overall score (independent solution-verifier) | 92 / 100 |
| Open Critical or High security findings | 0 |

SC1: Host creates event, audience joins by code — PASS (live prod round-trip verified by Playwright E2E).
SC2: Live tally updates within 2 s — PASS (p95 ~1.3 s, 30/30 trials).
SC3: Double-voting impossible — PASS (HTTP 409 on duplicate; conditional `attribute_not_exists` write verified by integration test + E2E).

---

### Inspiration

The "database as the hero" framing came from the hackathon brief itself. Most web apps treat the database as plumbing — invisible and interchangeable. DynamoDB's transactional model and write-sharding design make the data layer something worth explaining on-screen. The LIVE OPS component exists specifically to make the database's work visible to judges, hosts, and anyone watching the stream. The shard-dot animation is not cosmetic — each dot represents a real DynamoDB partition boundary.

---

### What we learned

- DynamoDB's single-table model rewards upfront key discipline. The investment in `lib/dynamo/keys.ts` as a pure, fully-tested key-construction module paid dividends throughout development — every repository function composes keys from the same functions, so access-pattern changes are localized.
- Write sharding requires a choice between random and deterministic shard assignment. We use djb2 hashing on `participantId` so the same participant always hits the same shard. This is safe because the dedup record prevents revoting regardless of shard.
- `TransactWriteItems` is more powerful than it first appears. The conditional `Put` + `ADD` combo gives you idempotency and consistency in a single round trip — replacing what would otherwise be a read-check-write with a race condition.
- Vercel OIDC is the correct credential model for serverless AWS access. Once the IAM trust policy is configured correctly, there are genuinely zero stored credentials anywhere — not in environment variables, not in CI, not in the repo.

---

### What's next

- **DynamoDB Streams fan-out:** wire the Lambda → API Gateway WebSocket path already documented in ARCHITECTURE.md. This extends the real-time architecture to millions of concurrent connections without changing a line of application code.
- **AI-assisted moment suggestions:** an optional OpenAI integration (gated behind env) generates poll questions and post-event sentiment summaries from word cloud data. The hook is already in the codebase.
- **Account-based identity:** current model is anonymous-by-design. Cognito integration would enable persistent event history and creator dashboards.

---

## Submission Checklist

All real values are filled in. Items marked [ACTION NEEDED] require a screenshot or URL captured by you.

| Item | Value | Status |
|------|-------|--------|
| Live URL | https://pulse-ochre-six.vercel.app | Verified live |
| Public repo | https://github.com/SebAustin/pulse | Public |
| Vercel Team ID | team_2iIQvsPyVwDrnAX6zJ7YgSuz | Confirmed |
| Track | Track 3 — Million-scale global app | Entered on Devpost form |
| AWS Database used | Amazon DynamoDB | Named in submission text above |
| Architecture diagram | docs/architecture-diagram.svg — export to PNG before uploading | [ACTION NEEDED] Open the SVG in a browser and export or screenshot as PNG |
| Storage Configuration screenshot | Screenshot from AWS Console: DynamoDB → Tables → Pulse → Overview tab (shows table name, billing mode On-demand, pk/sk) + Indexes tab (shows GSI1 and GSI2) | [ACTION NEEDED] Capture two screenshots or one screenshot showing both tabs |
| Demo video URL | [paste after upload to YouTube or Loom] | [ACTION NEEDED] Record using docs/DEMO_SCRIPT.md, upload, paste URL here and on Devpost |

---

## Repository contents (confirm before submitting)

The following files should be present in the public repo root:

- [x] `README.md` — overview, quickstart, architecture summary
- [x] `ARCHITECTURE.md` — single-table design, sequence diagrams, scale-out path
- [x] `DEPLOYMENT.md` — OIDC bootstrap, CDK deploy, Vercel env vars
- [x] `SECURITY.md` — STRIDE threat model, findings table, remediation status
- [x] `PLAN.md` — engineering design, all 23 access patterns
- [x] `DESIGN.md` — UI/UX specification, design tokens
- [x] `.env.example` — all env vars with placeholder values, no real secrets
- [x] `docs/adr/` — 6 Architecture Decision Records
- [x] `docs/RUNBOOK.md` — operations guide
- [x] `docs/DEMO_SCRIPT.md` — demo video script
- [x] `docker-compose.yml` — DynamoDB Local for local development and judge review
- [x] `infra/cdk/` — CDK stack (confirmation-gated deploy)
- [x] `test/` — unit + integration + E2E tests
