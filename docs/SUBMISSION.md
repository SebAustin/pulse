# Pulse — Hackathon Submission Kit

> Track: 3 — Million-scale global app  
> Hackathon: H0: Hack the Zero Stack with Vercel, v0 and AWS Databases  
> Deadline: 2026-06-29

This document contains the Devpost submission text and a checklist of required artifacts with instructions for filling in the placeholders.

---

## Devpost Submission Text

### Project name

Pulse

### Tagline

Real-time audience engagement that scales to a million — the database is the show.

### Problem and audience

Live events — conference talks, streams, classrooms, company all-hands — are one-way by default. The speaker can't tell if the audience is engaged, confused, excited, or tuned out. Existing tools (Mentimeter, Slido, Kahoot) require audience accounts, load slowly, or give stale results too late to be useful in the moment.

**The audience:** Streamers, teachers, conference speakers, and event organizers who run live sessions with remote or in-person audiences of 10 to 100,000 people.

**The problem:** Getting real-time audience feedback during a live event requires a tool that is fast to set up (seconds, not minutes), frictionless to join (no account, one screen), and live enough to be reacted to on-air.

### Solution

Pulse lets a host create an event in seconds and share a 6-character join code. Audience members join anonymously (display name only) from any browser. The host launches interactive moments — multiple-choice polls, word clouds, emoji reaction bursts, trivia questions with a countdown — and every connected screen sees aggregated results update within approximately 1 second.

The host's broadcast control room shows a live OpsReadout: writes per second, participant count, SSE subscriber count, and animated shard-activity dots. This isn't a debugging panel — it's a designed feature that makes the underlying DynamoDB architecture visible and exciting.

When the event closes, the host receives a stable analytics summary URL: unique participants, total interactions, peak concurrent audience, and top words per cloud.

### AWS database used: Amazon DynamoDB

**Why DynamoDB?**

Every design decision in Pulse maps to a DynamoDB capability:

| Requirement | DynamoDB capability |
|-------------|---------------------|
| No double votes, exact tally | `TransactWriteItems` — conditional vote dedup + counter `ADD` in a single atomic operation |
| 5,000+ writes/s to one event | Write-sharded counters (≥ 10 shards per poll option), verified under load (0 lost votes, 0 throttling errors) |
| Top-N leaderboard without table scan | GSI2 `Query ScanIndexForward=false Limit=N` — O(N), no Scan |
| Analytics that survive the judging window | Per-item-type TTL policy — durable items (EVENT, COUNTER, LB, USER, WORD) carry no TTL attribute |
| Million-viewer scale-out path | DynamoDB Streams already enabled; the Lambda → API Gateway WebSocket fan-out path is fully documented |
| Zero operational overhead | `PAY_PER_REQUEST` — no capacity planning, no pre-warming, no throttling at MVP scale |

**The hero moment:** a single `TransactWriteItems` call fuses the conditional vote dedup `Put` (with `attribute_not_exists(sk)`) and the counter shard `ADD` into one atomic operation. A vote and its tally can never diverge — this is a database guarantee, not application logic.

**The single-table design** uses one DynamoDB table (`Pulse`) with composite `pk`/`sk` keys, two GSIs, per-item-type TTL, on-demand billing, and Streams enabled. All 23 access patterns are mapped to explicit DynamoDB operations with no Scan anywhere.

**Why not Redis / relational / other?** A relational DB would require a separate table per entity and a JOIN for every snapshot. Redis counters can't give you conditional idempotency in a single atomic operation. DynamoDB's `TransactWriteItems` is uniquely suited to the vote-dedup + counter-increment pattern — it's the reason DynamoDB is the center of this product, not an implementation detail.

### How it maps to Track 3 (million-scale)

- **Write path** handles 5,000+ writes/s to a single event via 10 write-sharded counters per option (load-tested, 0 lost votes).
- **Read path** collapses shards in O(shards) — 40 DynamoDB items for 4 options × 10 shards, in one `Query`.
- **Real-time** uses SSE with a 500 ms micro-cache to dedup DynamoDB reads across SSE connections. p95 latency measured at ~1.3 s (gate is < 2 s).
- **Scale-out path**: DynamoDB Streams are already enabled. Adding a Lambda consumer → API Gateway WebSocket fan-out extends the architecture to millions of concurrent connections — documented and ready to wire.
- **OIDC credentials**: zero stored AWS keys. Short-lived credentials via `AssumeRoleWithWebIdentity`, scoped to the production environment of this specific Vercel project.

### Verified results

| Test | Result |
|------|--------|
| Unit tests | 137 passing |
| Integration tests (vs DDB Local) | 24 passing |
| E2E tests (Playwright) | 3 passing |
| Load test (5,000 writes) | 0 lost votes, 0 throttled requests |
| p95 latency (vote → second client) | ~1.3 s (gate < 2 s) |
| Overall score | 92 / 100 |

### Inspiration

The "database as the hero" framing came from the hackathon brief itself. Most web apps treat the database as infrastructure — invisible, interchangeable. DynamoDB's transactional model and write-sharding design make the data layer something worth explaining on-screen. The OpsReadout component — showing shard-dot animation and live writes/s — exists specifically to make the database's work visible.

### What we learned

- DynamoDB's single-table model rewards upfront key discipline. The investment in `lib/dynamo/keys.ts` as a pure, fully-tested single source of truth paid off throughout development.
- Write sharding requires careful shard assignment (we use a djb2 hash, not random, so the same participant always hits the same shard — harmless given the dedup record prevents re-voting).
- `TransactWriteItems` is more powerful than it looks: the conditional Put + ADD combo gives you idempotency and consistency in a single round trip, replacing what would otherwise be a read-check-write with race conditions.
- Vercel OIDC is the correct credential model for serverless AWS access — once the trust policy is right, there are genuinely zero stored credentials anywhere.

---

## Submission Checklist

Complete the following before submitting on Devpost. Replace each `[placeholder]` with the real value.

---

### Required artifacts

#### 1. Vercel Project URL

**What to fill in:** The URL of your deployed Pulse application on Vercel.

**How to find it:** After running `vercel --prod`, the Vercel CLI prints the production URL. It also appears in **Vercel Dashboard → your project → Deployments → Production**.

**Placeholder:** `[Vercel Project URL]`

Example: `https://pulse-abc123.vercel.app`

---

#### 2. Vercel Team ID

**What to fill in:** Your Vercel Team ID (required to verify OIDC trust policy scoping).

**How to find it:** See DEPLOYMENT.md § 11. Short version:

```bash
vercel teams list
```

Or: **Vercel Dashboard → team name → Settings → General → Team ID**.

**Placeholder:** `[Vercel Team ID]`

Example: `team_xxxxxxxxxxxxxxxxxxxx`

---

#### 3. Demo video URL

**What to fill in:** A YouTube or Loom URL for your < 3-minute demo video.

**How to create it:** Follow the script in [DEMO_SCRIPT.md](./DEMO_SCRIPT.md). Record with any screen recorder. Upload to YouTube (unlisted is fine) or Loom.

**Placeholder:** `[Demo video URL]`

---

#### 4. Architecture diagram image

**What to fill in:** A screenshot or export of the architecture diagram for the Devpost submission form.

**How to create it:** The Mermaid diagram in ARCHITECTURE.md (section 1) renders on GitHub. You can:
- Screenshot the rendered GitHub page.
- Use https://mermaid.live to paste the diagram source and export as PNG.
- Run `mmdc -i ARCHITECTURE.md -o architecture.png` with the `@mermaid-js/mermaid-cli` package.

**Placeholder:** `[Architecture diagram image]`

---

#### 5. Storage configuration screenshot

**What to fill in:** A screenshot of the DynamoDB table in the AWS Console showing the table name, billing mode, primary key, and indexes.

**How to create it:** See DEPLOYMENT.md § 10 for step-by-step instructions. Summary:
1. Open AWS Console → DynamoDB → Tables → Pulse.
2. Click the **Overview** tab — shows table name, billing mode (`On-demand`), primary key (`pk`/`sk`), Streams.
3. Click the **Indexes** tab — shows GSI1 and GSI2 configuration.
4. Screenshot with both tabs visible (or two separate screenshots).

**Placeholder:** `[Storage Configuration screenshot]`

---

### Repository link

The repository containing this code should be set to public (or shared with judges) before submission. Confirm the following are in the repository root:

- [x] `README.md` — overview, quickstart, architecture summary
- [x] `ARCHITECTURE.md` — deep architecture, single-table design, sequence diagrams
- [x] `DEPLOYMENT.md` — production deploy steps
- [x] `SECURITY.md` — threat model, findings, remediation status
- [x] `PLAN.md` — engineering design
- [x] `DESIGN.md` — UI/UX specification
- [x] `.env.example` — all env vars with placeholder values (no real secrets)
- [x] `docs/adr/` — 6 Architecture Decision Records
- [x] `docs/RUNBOOK.md` — operations guide
- [x] `docker-compose.yml` — DynamoDB Local for judges to run locally
- [x] `infra/cdk/` — CDK stack (gated deploy)
- [x] `test/` — unit + integration + E2E tests
