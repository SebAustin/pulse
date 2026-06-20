# Pulse — Requirements Brief

> Hackathon: "H0: Hack the Zero Stack with Vercel, v0 and AWS Databases"
> Track: 3 — Million-scale global app
> Submission deadline: 2026-06-29
> Document status: APPROVED (v1.0, 2026-06-20)

---

## 1. Restated Idea

Pulse is a real-time audience-engagement platform for live events — streams, conferences, classrooms, and meetups. A host creates an event, shares a 6-character join code or link, and then launches interactive moments (polls, word clouds, emoji reactions, trivia) at any point during the event. Every connected audience member sees aggregated results update in near real-time. The host closes the session and receives an analytics summary.

The stack is the hackathon's required "zero stack": Next.js (App Router, TypeScript) hand-built and deployed on Vercel, with Amazon DynamoDB as the hero database.

---

## 2. Personas and Jobs-to-be-Done

### Persona A — The Host

Who: A streamer, teacher, conference speaker, or event organiser running a live session with a remote or in-person audience.

Jobs-to-be-done:
- Create an event instantly, without requiring audience accounts.
- Launch interactive moments at exactly the right moment in the session.
- See aggregate results update live so they can react on-air or on-stage.
- Close the event and review what resonated (participation rate, top responses, peak moment).

Pain avoided: Fragmented tool switching, audience sign-up friction, results arriving too slowly to be useful live.

### Persona B — The Audience Member

Who: Anyone watching a stream, attending a conference session, or sitting in a classroom.

Jobs-to-be-done:
- Join the event in seconds (display name only, no account required).
- Participate in whatever the host launches (vote, type a word, react, answer trivia).
- See the live aggregate so participation feels responsive and social.

Pain avoided: Mandatory registration, confusing UI, stale results that arrive after the moment has passed.

---

## 3. Functional Requirements

### F-01 — Event Lifecycle

| ID | Requirement |
|----|-------------|
| F-01.1 | A host can create an event by providing an event title. The system generates a unique 6-character alphanumeric join code and a shareable join URL of the form `/join/{code}`. |
| F-01.2 | The host receives a host-control console URL that includes a host token in the path or session; this token gates all privileged actions. |
| F-01.3 | An audience member can join an active event by entering the join code or navigating to the join URL and providing only a display name (max 32 characters). |
| F-01.4 | The host can end an event at any time. Ended events are read-only; new joins and new moments are rejected. |
| F-01.5 | A join code is case-insensitive on input and normalised to uppercase in storage. |

### F-02 — Interactive Moments

Each moment type is launched by the host from the control console and becomes immediately active for all connected audience members.

#### F-02.1 Multiple-Choice Poll

| ID | Requirement |
|----|-------------|
| F-02.1.1 | Host defines a question (max 200 chars) and 2–6 answer options (max 80 chars each). |
| F-02.1.2 | Each audience member may vote at most once per poll (server enforces). |
| F-02.1.3 | Vote totals per option update on all connected clients within approximately 2 seconds of submission. |
| F-02.1.4 | Vote counters are stored using write sharding with a minimum of 10 shards per option and aggregated on read. |

#### F-02.2 Word Cloud

| ID | Requirement |
|----|-------------|
| F-02.2.1 | Host opens an open-text prompt (max 120 chars). |
| F-02.2.2 | Each audience member may submit one word or short phrase (max 40 chars) per word-cloud moment. |
| F-02.2.3 | The rendered cloud weights terms by submission frequency; updates arrive within approximately 2 seconds. |

#### F-02.3 Emoji Reaction Burst

| ID | Requirement |
|----|-------------|
| F-02.3.1 | Host opens a reaction window; the system offers a fixed palette of 6 emoji (defined at build time). |
| F-02.3.2 | Audience members may send unlimited emoji reactions during an open reaction window. |
| F-02.3.3 | Aggregate counts per emoji update on all connected clients within approximately 2 seconds. |

#### F-02.4 Trivia / Points Leaderboard

| ID | Requirement |
|----|-------------|
| F-02.4.1 | Host defines a trivia question with exactly one correct answer option and a time limit (10–60 seconds). |
| F-02.4.2 | Points are awarded based on correctness and speed (faster correct answers score higher); exact formula is an implementation choice. |
| F-02.4.3 | A leaderboard of the top-N participants (N configurable, default 10) is returned from a DynamoDB GSI — not a table scan. |
| F-02.4.4 | Leaderboard updates on all clients within approximately 2 seconds of each answer submission. |

### F-03 — Real-Time Delivery

| ID | Requirement |
|----|-------------|
| F-03.1 | The primary real-time mechanism is Server-Sent Events (SSE) delivered from a Next.js Route Handler. |
| F-03.2 | If SSE is unavailable or drops, the client falls back to HTTP polling at a configurable interval (default 3 seconds). |
| F-03.3 | The architecture for DynamoDB Streams fan-out is documented in the codebase but not built for MVP. |

### F-04 — Analytics Summary

| ID | Requirement |
|----|-------------|
| F-04.1 | When a host closes an event, a summary page is displayed showing: total unique participants, total interactions (votes + reactions + trivia answers), peak concurrent participants (best-effort), and the top 5 responses for each word-cloud moment. |
| F-04.2 | The summary is accessible at a stable URL for at least the duration of the hackathon judging window. |

### F-05 — Stretch: AI Assist (Gated — Do Not Build Until Core MVP Passes SC1–SC9)

| ID | Requirement |
|----|-------------|
| F-05.1 | Host can enter a topic and receive 2–3 suggested poll questions generated via the Anthropic Claude API. |
| F-05.2 | Post-event summary page optionally includes an AI-generated sentiment summary of word-cloud submissions for that session. |
| F-05.3 | AI features degrade gracefully (feature hidden) when the Anthropic API key is absent or the API returns an error. |

---

## 4. Non-Functional Requirements

### NFR-01 — Performance and Scale (Track 3 targets)

| ID | Requirement |
|----|-------------|
| NFR-01.1 | The DynamoDB data model must support at least 5,000 concurrent write operations against a single event without unhandled throttling errors; verified by a load script (see SC5). |
| NFR-01.2 | End-to-end latency from vote submission to counter update visible on a second client must be below 2 seconds at p95 under normal load (50–200 concurrent users). |
| NFR-01.3 | DynamoDB table is provisioned with on-demand billing (PAY_PER_REQUEST); no provisioned capacity units are set. |
| NFR-01.4 | Write sharding (minimum 10 shards per counter) must be in place for all high-cardinality counters (poll options, emoji counts) to avoid hot-key throttling. |
| NFR-01.5 | All aggregate reads collapse shards in the application layer; no separate aggregation job is required for MVP. |

### NFR-02 — Core Web Vitals and Frontend Performance

| Metric | Target |
|--------|--------|
| LCP | < 2.5 s |
| INP | < 200 ms |
| CLS | < 0.1 |
| FCP | < 1.5 s |
| JS bundle (landing/join page, gzipped) | < 150 KB |
| JS bundle (host console page, gzipped) | < 300 KB |

### NFR-03 — Security

| ID | Requirement |
|----|-------------|
| NFR-03.1 | No AWS credentials appear in the repository at any commit. The production auth path uses OIDC (IAM role for GitHub Actions or Vercel OIDC); this path must be documented even if the actual IAM role is not provisioned. |
| NFR-03.2 | The repository contains `.env.example` listing all required environment variable names with placeholder values and inline comments. `.env.local` and any file containing real secrets must be in `.gitignore`. |
| NFR-03.3 | Host tokens are unguessable (minimum 128-bit random, URL-safe encoding). |
| NFR-03.4 | All state-changing API routes validate the host token before executing. |
| NFR-03.5 | A production Content Security Policy header is configured in `next.config`. |
| NFR-03.6 | User-supplied display names and text submissions are length-validated on the server and not rendered as raw HTML. |

### NFR-04 — Accessibility

| ID | Requirement |
|----|-------------|
| NFR-04.1 | All interactive elements are keyboard-navigable and have visible focus indicators. |
| NFR-04.2 | Color contrast ratios meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text). |
| NFR-04.3 | Live aggregate updates are announced to screen readers via ARIA live regions. |
| NFR-04.4 | Animated elements (emoji burst, word-cloud transitions) respect `prefers-reduced-motion`. |

### NFR-05 — Observability

| ID | Requirement |
|----|-------------|
| NFR-05.1 | Vercel function logs capture: event ID, moment ID, error type, and DynamoDB HTTP status code for every failed write. |
| NFR-05.2 | DynamoDB consumed capacity metrics are enabled (ReturnConsumedCapacity: TOTAL on all writes) and logged at debug level for load-test runs. |

### NFR-06 — Developer Experience

| ID | Requirement |
|----|-------------|
| NFR-06.1 | `npm run dev` + a seed script starts the full application against DynamoDB Local (Docker image `amazon/dynamodb-local`); no real AWS account is needed. |
| NFR-06.2 | `npm run build`, `npm run lint`, `npm run typecheck`, and `npm test` all exit with code 0 before the submission deadline. |
| NFR-06.3 | Any IaC or deploy script that would create or modify real AWS resources must prompt for explicit confirmation before executing. |

---

## 5. Non-Goals (Explicit Out-of-Scope)

| # | What is NOT in scope | Why |
|---|----------------------|-----|
| NG-01 | Real AWS resource provisioning during development | Hackathon constraint; prevents accidental spend. |
| NG-02 | Heavy authentication (OAuth, email/password, MFA) for audience members | Friction kills live-event participation. Anonymous join is the product insight. |
| NG-03 | WebSocket or DynamoDB Streams fan-out at the infrastructure level | Documented-not-built; SSE + polling covers MVP. |
| NG-04 | Persistent user accounts or cross-event identity for audience | Out of scope for anonymous participation model. |
| NG-05 | Mobile native app (iOS / Android) | Web-first; responsive browser experience is sufficient. |
| NG-06 | Multi-region DynamoDB Global Tables | Single-region (us-east-1) is sufficient for the hackathon demo. |
| NG-07 | Payment, monetisation, or subscription tiers | Out of scope. |
| NG-08 | Video or audio streaming | Pulse augments an existing stream/session; it does not host one. |
| NG-09 | Custom emoji upload or branded theming by hosts | Default emoji palette only; no per-host branding. |
| NG-10 | GDPR/CCPA compliance documentation or data-deletion workflows | Out of scope for hackathon; would be post-launch work. |

---

## 6. Success Criteria

Each criterion is testable independently. "Pass" means the described verification produces the stated outcome.

| ID | Description | How to Verify | Pass Condition |
|----|-------------|---------------|----------------|
| SC1 | Host creates event; audience member joins via code in a fresh browser | Manual test: create event, copy code, open incognito window, enter code and display name | Join succeeds; audience view renders the active event with the correct title. |
| SC2 | Live poll tally updates on all connected clients within ~2 s of a vote | Manual test with two browsers open; record wall-clock time from vote submission to tally change on the second browser | Tally visible on the second client within 2 000 ms of submission (measured at least 5 times; 4 of 5 must pass). |
| SC3 | Double-voting impossible | Manual test: vote on a poll, then attempt a second vote from the same session; also attempt via direct API call with the same participant ID | Server returns 409 (or equivalent) on the second attempt; UI shows appropriate error; tally does not increment. |
| SC4 | Vote counters use write sharding with >=10 shards per option and aggregate correctly on read | Code review: confirm shard count constant >= 10 in the data-access layer; integration test: submit N known votes, read aggregate, assert aggregate equals N | Shard constant confirmed >= 10; aggregate read returns exact N for any N tested (1, 10, 100). |
| SC5 | Load script firing >=5 000 writes at one event shows no lost votes and no unhandled throttling | Run `npm run load-test` (or equivalent) targeting DynamoDB Local; capture consumed capacity and error rate | Zero ProvisionedThroughputExceededException or unhandled errors; final aggregate equals the number of writes sent. |
| SC6 | Leaderboard returns correct top-N via a GSI, not a table scan | Code review: no `Scan` call in leaderboard path; integration test: seed known scores, query leaderboard, assert order and values | No Scan in the leaderboard query path; returned order matches expected ranking for seeded data. |
| SC7 | App runs locally end-to-end against DynamoDB Local with `npm run dev` + seed | Fresh checkout; run `npm run dev`; run seed script; complete SC1 flow entirely against localhost | All flows complete without real AWS credentials or network egress to AWS. |
| SC8 | No AWS credentials in repo; OIDC documented prod path; .env.example only | `git log --all -- '*.env*'` shows no secret values; `.env.example` present with placeholder values; OIDC IAM role ARN pattern documented in `docs/deploy.md` or equivalent | Git history contains no real key IDs or secrets; `.env.example` exists; OIDC path documented. |
| SC9 | `npm run build`, lint, typecheck, and test suite all pass; CI green | Push to main branch; observe CI pipeline | All four commands exit 0; CI pipeline shows green status. |
| SC10 | Gated deploy scripts prompt for explicit confirmation before provisioning anything | Review deploy script source; run deploy script with `--dry-run` or equivalent and decline the prompt | No AWS API calls are made unless the operator types a confirmation string; dry run exits cleanly without provisioning. |

---

## 7. DynamoDB Data Model Constraints (Architecture Inputs)

These are requirements the architect must honour — not design choices.

- Single-table design: one DynamoDB table for the entire application.
- Write sharding: counters use a shard suffix pattern (`{id}#shard#{n}`) with n in [0, SHARD_COUNT).
- Idempotency: conditional writes (`attribute_not_exists`) prevent duplicate vote records.
- GSI for leaderboard: a GSI keyed on `eventId` (partition) and `score` (sort) supports top-N queries without Scan.
- Streams: the table has DynamoDB Streams enabled (NEW_AND_OLD_IMAGES); fan-out consumer is documented but not wired for MVP.
- Region: us-east-1, on-demand billing.

---

## 8. Design Direction

The frontend must not look like a default template. Required qualities (per project design standards):

- Clear hierarchy through scale contrast (event title dominant, moment content secondary, aggregate data tertiary).
- Intentional rhythm — live-event energy, not a dashboard.
- Depth through overlapping surfaces and subtle motion.
- Emoji burst and word-cloud animations respect `prefers-reduced-motion`.
- Typography pairing: one display face + one utility face.
- Both the audience join view and the host console must look purposefully designed, not stock.

Style direction recommendation: dark luxury with high-contrast data readouts and burst-motion accents — appropriate for a live-event product.
