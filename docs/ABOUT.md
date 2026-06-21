# Pulse — About the project

> Real-time audience engagement that scales to millions, built on **Amazon DynamoDB** + **Vercel**.
> Live demo: https://pulse-ochre-six.vercel.app · Code: https://github.com/SebAustin/pulse

## Inspiration

Every conference, classroom, and livestream wants the same thing: turn a passive crowd into part of the show. The tools that do this today (Slido, Mentimeter, Kahoot) are paid, closed, and — most tellingly — they treat the database as something to hide. You never actually know whether they'd survive the moment a session goes viral and ten thousand people tap "vote" in the same second.

This hackathon's premise flipped that for us: *prototype on the same data foundation startups and enterprises run in production.* So instead of bolting a database onto a CRUD app, we asked the opposite question — **what if the database were the hero of the product?** What if you could *see* it absorbing a burst of traffic, and prove that you can't oversell a limited slot or double-count a vote, even under a stampede? That idea — making correctness-at-scale a visible feature — became Pulse.

## What it does

A host creates an event in seconds and gets a 6-character join code. The audience joins anonymously from any phone — no app, no account, just a name. The host then launches **live moments**:

- **Multiple-choice polls** with tallies that animate in real time
- **Word clouds** from open-text submissions
- **Emoji reaction bursts**
- **Trivia with a live leaderboard** (server-authoritative scoring)

Every connected screen updates within ~1–2 seconds. Double-voting is impossible. When the event ends, the host gets an analytics summary. The host console also has a **LIVE OPS** panel that exposes the DynamoDB write-sharding as it happens — writes/second, shard count, live participants — the database, made visible.

## How we built it

- **Frontend:** Next.js 16 (App Router, TypeScript) deployed on **Vercel**; a deliberate "live broadcast / control room" design system (dark host console, bright mobile-first audience surface).
- **Data:** **Amazon DynamoDB**, single-table design. One table (`Pulse`, `pk`/`sk`) holds every entity — events, polls, votes, sharded counters, reactions, leaderboard, presence — with `GSI1` (code → event) and `GSI2` for top-N leaderboards (no table scans, ever).
- **The hero pattern — one atomic guarantee.** A vote is a single `TransactWriteItems` that does two things together:
  1. a **conditional `Put`** of a dedup record with `attribute_not_exists(sk)`, and
  2. an **`ADD`** to a write-sharded counter.

  Because they commit atomically, *"you can't double-vote"* and *"the tally is always correct"* aren't two features that can drift apart — they're the **same** guarantee.
- **Beating the hot partition.** A viral event sends all its writes to one `EVENT#<id>` partition. A single DynamoDB partition sustains roughly **1,000 write units/second**, so one shared counter would throttle. We spread each option's counter across **N ≥ 10** shards. With an arrival rate of **λ** writes/second, each shard sees only:

  $$\lambda_{\text{shard}} \approx \frac{\lambda}{N}$$

  *(plain text:* `writes_per_shard ≈ λ / N` *)*

  At **λ = 5,000 writes/s** and **N = 10**, that's **5000 / 10 = 500 writes/s per shard** — comfortably under the ceiling. Reads recombine the shards by summing them:

  $$\text{total}(o) = \sum_{i=1}^{N} c_{o,i}$$

  *(plain text:* `total(option) = c₁ + c₂ + … + c_N` — the sum of that option's shard counts *)*

  We pay a small fan-out read to buy effectively unbounded write throughput — the right trade for a write-heavy live event.
- **Real-time:** Server-Sent Events stream aggregated snapshots, with automatic polling fallback — a pragmatic path that works on serverless without standing up a socket fleet.
- **Security by design:** production AWS credentials come from **Vercel OIDC** via `AssumeRoleWithWebIdentity` — **zero stored keys**. Host and participant identities are HMAC-signed `httpOnly` cookies; every input is validated with Zod; CSP + HSTS are set.
- **Ops:** AWS CDK for a gated, one-command provision; GitHub Actions CI; 137 unit + 24 integration + 3 end-to-end tests, plus a 5,000-write load harness.

## Challenges we ran into

Almost every bug shared a theme: **"it compiles and the tests are green" is not the same as "it works."**

- **The invisible serialization bug.** The data layer passed every build, type-check, lint, and unit test — yet every *real* DynamoDB call failed. A lazily-evaluated `TableName` proxy looked like a string but didn't serialize like one under the AWS SDK's newer schema serializer. Only running against a real DynamoDB surfaced it.
- **Edge runtime ≠ Node.** Our host-link "capability URL → `httpOnly` cookie" redemption ran in Edge middleware, which can't load `node:crypto`. The fix was simpler than the bug: store the raw token in the cookie and verify it against the stored hash server-side — no crypto on the edge at all.
- **A CSP that killed hydration.** A strict `script-src` blocked Next.js's inline bootstrap scripts; the page rendered but was completely dead. Nonces don't play nicely with static rendering, so we chose a pragmatic CSP that preserves performance while the real XSS surface stays closed (no `dangerouslySetInnerHTML`, React escapes everything).
- **The OIDC trust-policy mismatch (the one that actually broke production).** After deploying, *"create event"* returned 500s even though every environment variable was set. Federation only works when the IAM trust policy's `iss`/`aud`/`sub` match the token **exactly**. We'd assumed "Team ID" meant the `team_…` identifier — but Vercel's real token is keyed on the team **slug**, project **name**, and audience `https://vercel.com/<slug>`. We confirmed it by reading the actual token, then rewrote the trust policy. **Lesson: get the real token before touching IAM again.**
- **Localhost in production.** Share links were built from a hardcoded `http://localhost:3000`. Fixed by deriving the origin from the request's forwarded headers.

## Accomplishments that we're proud of

- **It's genuinely live**, not a mock — create → join → vote → dedup → live tally all verified against real DynamoDB through OIDC, with **no stored credentials**.
- **The atomic dedup-plus-counter design** that turns two correctness properties into one.
- **We made the backend part of the UX** — the LIVE OPS readout shows the sharded writes happening, so the database's behavior is something the audience can *see*.
- **Verified scale + speed:** a 5,000-write burst with **zero lost votes**, and a live-tally **p95 ≈ 1.3 s** (under our 2 s gate).
- An independent verifier scored the build **92/100** with **no open critical/high security findings**.

## What we learned

- **Trust the runtime, not the green checkmark.** Each layer of "passing" hid a defect that only the next-deeper check — real I/O, a real browser, a real production token — could expose. Verification has to exercise the actual path.
- **DynamoDB rewards intentional modeling.** Single-table design plus write-sharded counters is *how* you scale writes; the read-side sum (`Σ cᵢ`) is the conscious trade. Naming your access patterns first makes the schema fall out.
- **OIDC federation is exact-match.** The cleanest way to debug "AWS won't authorize" is to decode the real token's claims instead of guessing identifiers.
- **The best fixes remove moving parts.** Dropping the edge HMAC layer and the CSP nonce both made the system simpler *and* correct.

## What's next for Pulse

- **True million-subscriber fan-out:** DynamoDB Streams → Lambda → API Gateway WebSockets so reads scale past the current SSE-per-connection ceiling (designed and documented; Streams already enabled).
- **AI assist:** poll-question generation and post-event sentiment summaries (already wired behind a feature flag).
- **Global low latency:** DynamoDB global tables for multi-region active-active.
- **Accounts & anti-abuse:** optional Cognito identity for stronger Sybil resistance beyond the current anonymous model.
- **Monetization:** hosted tiers, custom branding, and analytics export — the path from hackathon demo to a shippable product.
