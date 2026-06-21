# ACCEPTANCE — Pulse

**Project:** Pulse — real-time global audience-engagement platform (live polls, word clouds,
emoji reactions, trivia leaderboards).
**Hackathon:** H0 — Hack the Zero Stack with Vercel, v0 and AWS Databases · **Track 3 (million-scale)**.
**Stack:** Next.js 16 (App Router, TypeScript) on Vercel · **Amazon DynamoDB** (single-table).
**Final verdict:** ✅ **SOLID — 92/100** (independent `solution-verifier`, evidence-based, every
rubric criterion ≥ 4/5; no open Critical/High security findings).

---

## Success criteria — pass/fail with evidence

| ID | Criterion | Result | Evidence |
|----|-----------|--------|----------|
| SC1 | Host creates event; audience joins by code | ✅ PASS | Playwright E2E SC1 against the **production** build; live API round-trip create→join. |
| SC2 | Live tally updates within ~2s | ✅ PASS | `latency-probe`: 30/30 trials, **p95 ~1.3s < 2000ms** (hard gate); E2E SC2. |
| SC3 | Double-voting impossible (server-rejected) | ✅ PASS | Integration dedup test + E2E SC3 (HTTP 409 DUPLICATE); conditional `attribute_not_exists` write. |
| SC4 | Write-sharded counters (≥10/option), exact aggregate | ✅ PASS | Integration aggregate == N for N=1/10/100; `SHARD_COUNT = max(10, …)`. |
| SC5 | ≥5,000 writes, no lost votes, no unhandled throttle | ✅ PASS | `loadtest`: **5000 accepted / 0 dup / 0 err / aggregate 5000**. |
| SC6 | Leaderboard top-N via GSI (no Scan) | ✅ PASS | Integration GSI2 ordering test; no `ScanCommand` in `src/`. |
| SC7 | Runs locally end-to-end vs DynamoDB Local | ✅ PASS | `ddb:up` + `ddb:init` + `seed` (exit 0) + `dev`; full flow verified. |
| SC8 | No AWS creds in repo; OIDC documented; `.env.example` only | ✅ PASS | Secret grep clean; `.env*` gitignored; OIDC in DEPLOYMENT.md / ADR-004. |
| SC9 | build + lint + typecheck + tests pass; CI green | ✅ PASS | All exit 0; CI workflow (lint+unit / integration / **e2e as a real gate**). |
| SC10 | Gated deploy provisions nothing without confirmation | ✅ PASS | `init-aws.sh` / `deploy-infra.sh` require typed `yes`; `DRY_RUN=true` makes 0 AWS calls; `cdk synth` offline. |

**All 10 success criteria met.**

---

## Build / test log (final run)

```
npm run typecheck         exit 0
npm run lint              exit 0
npm test                  137 passed (8 files)
npm run test:integration  24 passed  (vs DynamoDB Local)
npm run e2e               3 passed   (SC1/SC2/SC3, against `npm start` prod build)
npm run build             exit 0     (Next.js 16, all routes + middleware)
npm run loadtest          5000 accepted / 0 lost / aggregate 5000
npm run latency-probe     30/30 trials, p95 ~1.3s < 2000ms
npm run cdk:synth         exit 0 (offline, no AWS account)
npm audit --omit=dev --audit-level=critical   exit 0
```

## Security posture

STRIDE threat model in `SECURITY.md`. **0 Critical / 0 open High.** Resolved & runtime-verified:
F-01 (host capability-URL redeemed to httpOnly cookie; token never in URL/client; reserved-path
guard), F-02 (vote bound to HMAC-signed httpOnly participant cookie — body `participantId` not
trusted), F-03 (zod displayName), F-04 (`hostTokenHash` stripped from public responses), F-05
(CSPRNG collision-checked join codes), F-11 (CSP + HSTS). Prod credentials via **Vercel OIDC —
no stored keys**; least-privilege IAM scoped to the one table + its GSIs.

---

## Built

- Production-ready Next.js 16 app: host control room + mobile audience surface (anti-template
  "live broadcast" design system, accessible, reduced-motion aware).
- DynamoDB single-table data layer: atomic `TransactWrite` vote (dedup + sharded counter),
  GSI leaderboard (no Scan), TTL, presence, ops/throughput counters, Streams enabled.
- SSE real-time with polling fallback; live `OpsReadout` (write-sharding made visible).
- Security: OIDC, httpOnly cookie auth (host + participant), zod boundaries, CSP/HSTS, rate limiting.
- Tests: 137 unit + 24 integration + 3 E2E; load + latency harnesses with hard gates; GitHub Actions CI.
- Gated AWS deploy: AWS CDK stack + `init-aws.sh` / `deploy-infra.sh` (confirmation-gated) + DEPLOYMENT.md.
- Docs: README, ARCHITECTURE (+ Mermaid), 6 ADRs, RUNBOOK, SECURITY; submission kit
  (SUBMISSION.md, DEMO_SCRIPT.md, architecture-diagram.svg).

## Deferred (documented, not built — intentional MVP scope)

- DynamoDB Streams → Lambda → API Gateway WebSocket fan-out (the true million-subscriber read path).
- Optional AI assist (Claude): poll suggestions + post-event sentiment summary (gated behind env).
- Cognito/account-based identity (current model is anonymous-by-design; Sybil resistance is a non-goal).

## Next (recommended polish — non-blocking; from final review)

- Production startup guard that hard-fails when `PULSE_DB_MODE=aws` and `PULSE_SESSION_SECRET` is unset.
- Add a unit test for the middleware reserved-`summary` pass-through branch (currently E2E-covered).

_Resolved 2026-06-21:_ `npm run seed` is now idempotent — it clears any prior demo-event partition
(and its `CODE#` lookup) before recreating, so repeat local runs no longer fail with
`ConditionalCheckFailed`. The stable demo URL (`DEMO0001` / `DEMO01`) is preserved.

---

## Submission readiness (user actions to finish the Devpost entry)

Everything below is prepared; these require the user's own accounts/credentials:

1. **Deploy** — run the gated rollout in `DEPLOYMENT.md`: `npm run deploy:init-aws` (OIDC role),
   `npm run deploy:infra` (DynamoDB table), then deploy the app to Vercel.
2. **Capture artifacts** (checklist in `docs/SUBMISSION.md`): published Vercel Project URL,
   Vercel Team ID, Storage Configuration screenshot, the architecture diagram
   (`docs/architecture-diagram.svg` → export PNG).
3. **Record the <3-min demo** following `docs/DEMO_SCRIPT.md`; upload to YouTube.
4. **Submit** the Devpost text from `docs/SUBMISSION.md` (DB used: Amazon DynamoDB).
