# Pulse Runbook — Operate, Monitor, Troubleshoot

---

## 1. Local Development

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20 LTS or 22 | App build and scripts |
| npm | 10+ | Package manager |
| Docker | Any recent | DynamoDB Local |

### Full setup

```bash
npm install
npm run ddb:up      # Start amazon/dynamodb-local on port 8000
npm run ddb:init    # Create table schema + GSIs
npm run seed        # Seed a demo event (prints eventId + hostToken)
npm run dev         # Start Next.js on http://localhost:3000
```

Or all in one:

```bash
npm run dev:local   # ddb:up + ddb:init + next dev
```

### Environment variables for local dev

Copy `.env.example` to `.env.local` and set:

```
PULSE_DB_MODE=local
PULSE_TABLE_NAME=Pulse
AWS_REGION=us-east-1
DYNAMODB_LOCAL_ENDPOINT=http://localhost:8000
```

All other variables have sensible defaults. `OPENAI_API_KEY` is optional — AI features are hidden when absent.

### Stop DynamoDB Local

```bash
npm run ddb:down
```

---

## 2. Running Tests

```bash
# Full unit test suite
npm test

# Integration tests (requires DDB Local running)
npm run test:integration

# E2E tests (requires dev server at localhost:3000 AND DDB Local)
npm run e2e

# Coverage report
npm run test:coverage

# Latency probe — measures vote-to-second-client p95
# Pass condition: p95 < 2 000 ms; fails the M3 milestone gate if >= 2 000 ms
npm run latency-probe

# Load test — 5 000 writes against one event
# Pass condition: final aggregate == writes sent, zero ThrottledRequests
npm run loadtest
```

### Build and type checks

```bash
npm run build       # Production build — must exit 0
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
```

---

## 3. Production Deploy

Full production deploy instructions are in **[DEPLOYMENT.md](../DEPLOYMENT.md)**. The summary is:

1. Run `npm run deploy:init-aws` — creates the OIDC provider and IAM role (prompts for `yes`).
2. Run `npm run deploy:infra` — synthesizes and deploys the DynamoDB CDK stack (prompts for `yes`).
3. Set the required env vars in the Vercel dashboard (see Section 4 below).
4. Run `vercel --prod` — deploys the Next.js app.

Both `deploy:init-aws` and `deploy:infra` are **gated** — they print every AWS command before running and require explicit confirmation. `DRY_RUN=true` mode exits without provisioning.

To synthesize the CDK stack offline (no AWS credentials needed):

```bash
npm run cdk:synth
```

---

## 4. Environment Variables

### Required in production

| Variable | Description |
|----------|-------------|
| `PULSE_DB_MODE` | Must be `aws` in production |
| `PULSE_TABLE_NAME` | `Pulse` (or the name from CDK outputs) |
| `AWS_REGION` | `us-east-1` |
| `AWS_ROLE_ARN` | `arn:aws:iam::<account>:role/PulseVercelRole` |
| `PULSE_SESSION_SECRET` | 32+ byte random value (`openssl rand -base64 32`). **Required.** Without this, participant cookies use a fixed dev-only fallback — a known security weakness. |

### Optional tuning (defaults shown)

| Variable | Default | Purpose |
|----------|---------|---------|
| `SSE_INTERVAL_MS` | `1000` | SSE snapshot emit cadence |
| `SSE_CACHE_TTL_MS` | `500` | In-process snapshot micro-cache TTL |
| `POLL_INTERVAL_MS` | `3000` | HTTP polling fallback interval |
| `SHARD_COUNT` | `10` | Counter shards per option (≥ 10) |
| `PRESENCE_TTL_SEC` | `15` | Presence item liveness window |
| `PRESENCE_HEARTBEAT_MS` | `5000` | Heartbeat/presence refresh cadence |
| `OPS_WINDOW_SEC` | `5` | Rolling window for writes/s calculation |
| `OPS_WRITES_TTL_SEC` | `60` | TTL for OPS#WRITES buckets |
| `REACTION_TTL_SEC` | `600` | TTL for ephemeral REACTION# items |
| `JUDGING_WINDOW_DAYS` | `30` | Minimum retention for durable items |
| `OPENAI_API_KEY` | (empty) | Enables AI assist features when set |

`VERCEL_OIDC_TOKEN` is injected automatically by Vercel at runtime — do not set it manually.

---

## 5. Monitoring

### Application logs

All server-side events are logged as structured JSON to stdout via `src/lib/observability/log.ts`. Vercel captures stdout as function logs, visible in **Vercel Dashboard → Logs**.

Log schema:

```json
{ "level": "info|warn|error", "msg": "...", "eventId": "...", "momentId": "...", "errorType": "..." }
```

Every failed DynamoDB write logs `eventId`, `momentId`, `errorType`, and the DynamoDB HTTP status code.

### DynamoDB metrics (AWS Console)

Navigate to **DynamoDB → Tables → Pulse → Metrics**:

| Metric | Healthy value |
|--------|--------------|
| `SuccessfulRequestLatency` | < 5 ms for GetItem/PutItem at MVP scale |
| `ThrottledRequests` | 0 (on-demand table; non-zero indicates a hot partition) |
| `SystemErrors` | 0 |
| `ConsumedWriteCapacityUnits` | Rises during active events; no explicit cap on PAY_PER_REQUEST |

### OpsReadout (host console)

The **Live Ops** panel on the host console (`GET /api/events/[eventId]/ops`) shows live writes/s, participant count, SSE subscriber count, and shard-activity dots. If the ops endpoint fails, all values show `—` (graceful degradation, no crash).

---

## 6. Common Failure Modes

### DynamoDB Local not running

**Symptom:** Any API route returns a connection refused error or the app fails to start.

**Fix:**

```bash
npm run ddb:up      # Start DynamoDB Local
npm run ddb:init    # Recreate the table if needed (idempotent)
```

Check Docker is running: `docker ps`.

---

### OIDC role misconfiguration (production)

**Symptom:** API routes return 500; Vercel function logs show `AccessDeniedException` or `The security token included in the request is invalid`.

**Diagnosis:**

1. Confirm `AWS_ROLE_ARN` is set correctly in Vercel env vars.
2. Confirm the OIDC provider ARN in IAM matches `oidc.vercel.com/<team-id>`.
3. Confirm the trust policy `sub` condition matches `owner:<team-id>:project:<project-id>:environment:production`.
4. Confirm the deployment is in the `production` environment (not preview — preview deployments cannot assume the role by default).

**Fix:** Re-run `npm run deploy:init-aws` with the correct `VERCEL_TEAM_ID` and `VERCEL_PROJECT_ID`.

---

### SSE disconnects / Vercel Hobby tier

**Symptom:** Real-time updates stop after 60 s; clients show "Reconnecting…" continuously.

**Cause:** Vercel Hobby tier limits function duration to 60 s. The SSE handler uses `maxDuration=300` which requires Vercel Pro/Enterprise.

**Fix:**

- Upgrade to Vercel Pro, or
- The polling fallback (`?once=1`) activates automatically when SSE fails — clients will receive updates every `POLL_INTERVAL_MS` (3 000 ms) at the cost of higher latency.

---

### Host console shows 401 after clicking the ops or summary link

**Symptom:** OpsReadout shows `—` for all values; the summary page shows "Unauthorized".

**Cause:** The httpOnly cookie `pulse_host_<eventId>` was not set — usually because the host navigated directly to the tokenless URL without going through the original magic link first.

**Fix:** The host must visit the original magic link (`/host/<eventId>/<hostToken>`) in the same browser session. Edge middleware will redeem the token and set the cookie.

---

### Load test reports lost votes

**Symptom:** `npm run loadtest` final aggregate < number of writes sent.

**Cause:** Should not occur under normal conditions. Investigate:

1. DynamoDB Local may have been restarted during the run — all in-memory data is lost.
2. The load test may have exhausted DDB Local's connection pool. Reduce concurrency or increase JVM heap: `docker compose up -d` uses the default Docker image settings; add `-Xmx2g` to the `amazon/dynamodb-local` command in `docker-compose.yml`.

**Fix:** Restart DDB Local, re-run `ddb:init`, and re-run the load test.

---

### `PULSE_SESSION_SECRET` not set in production

**Symptom:** Participant cookies are signed with a fixed dev fallback (`dev-secret-change-in-production`). All participants can forge each other's identities.

**Fix:** Generate a strong secret and add it to Vercel env vars:

```bash
openssl rand -base64 32
```

Set as `PULSE_SESSION_SECRET` in **Vercel Dashboard → Settings → Environment Variables** for the Production environment. Redeploy.

---

### Join code collision / 500 on event create

**Symptom:** `POST /api/events` returns 500 with "Failed to generate a unique event code."

**Cause:** Very unlikely at hackathon scale (32^6 ≈ 1 billion distinct codes). At very large scale, the collision retry loop (5 attempts) would eventually fail.

**Fix:** The event creation handler retries up to `MAX_CODE_RETRIES = 5` times. Each retry generates a fresh CSPRNG code. If this genuinely fails in production, increase `MAX_CODE_RETRIES` or pre-generate a pool of codes.

---

## 7. Rollback and Teardown

### Destroy everything on AWS (one command)

```bash
DRY_RUN=true npm run destroy:infra   # preview — no AWS calls
npm run destroy:infra                # gated: confirms each step (stack, table, IAM/OIDC)
```

Removes the `PulseStack` CloudFormation stack, the **retained** DynamoDB table (the CDK stack uses
`RemovalPolicy.RETAIN`, so a plain `cdk destroy` leaves the table behind), and the IAM role +
Vercel OIDC provider. Each destructive step requires typing `yes`. The manual equivalents are below.

### Roll back the Vercel deployment

```bash
vercel ls                     # list recent deployments
vercel promote <deploy-url>   # promote a previous build to production
```

The DynamoDB table is unaffected by a Vercel rollback.

### Tear down the CDK stack

```bash
cd infra && npx cdk destroy PulseStack
```

**The DynamoDB table has `RemovalPolicy.RETAIN`** — `cdk destroy` removes the CloudFormation stack but does NOT delete the table. To permanently delete all data:

```bash
aws dynamodb delete-table --table-name Pulse --region us-east-1
```

Only run this when you are certain you want to permanently delete all event data.

### Full IAM teardown

```bash
aws iam delete-role-policy --role-name PulseVercelRole --policy-name PulseDynamoDBDataPlane
aws iam delete-role --role-name PulseVercelRole
aws iam delete-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::<account-id>:oidc-provider/oidc.vercel.com/<team-id>
```

---

## 8. Smoke Test Checklist (Post-Deploy)

Run these checks immediately after a production deployment:

- [ ] `GET /` → HTTP 200, landing page loads
- [ ] `POST /api/events` with `{"title":"Smoke Test"}` → 201, body contains `eventId`, `code`, `hostToken`
- [ ] `GET /join/<code>` → HTTP 200
- [ ] `POST /api/join` with `{"code":"<code>","displayName":"Tester"}` → 200, body contains `participantId`
- [ ] `GET /api/stream/<eventId>` → SSE connection opens, `event: snapshot` arrives within 3 s
- [ ] Visit `/host/<eventId>/<hostToken>` → 307 redirect to `/host/<eventId>`, console loads
- [ ] `POST /api/events/<eventId>/moments` (with host cookie) → 200, moment created
- [ ] `POST /api/votes` → 200 first time, 409 on second attempt from same `participantId`
- [ ] `GET /api/stream/<eventId>` → updated tally visible within ~2 s of the vote
- [ ] Vercel function logs show no unhandled errors
- [ ] DynamoDB CloudWatch metrics show `ThrottledRequests = 0`
