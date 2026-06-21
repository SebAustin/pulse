# DEPLOYMENT.md — Pulse Rollout Runbook

> Deployment target: Vercel (Next.js 16 App Router) + Amazon DynamoDB (single table, us-east-1).
> Credential model: Vercel OIDC → AssumeRoleWithWebIdentity → no stored AWS keys anywhere.
> Last updated: 2026-06-20.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Architecture recap](#2-architecture-recap)
3. [Step-by-step rollout](#3-step-by-step-rollout)
   - 3.1 Bootstrap the Vercel ↔ AWS OIDC trust
   - 3.2 Provision DynamoDB infrastructure
   - 3.3 Configure Vercel environment variables
   - 3.4 Deploy the Next.js app to Vercel
4. [The single gated production command](#4-the-single-gated-production-command)
5. [OIDC trust policy and IAM policy shapes](#5-oidc-trust-policy-and-iam-policy-shapes)
6. [Vercel environment variables reference](#6-vercel-environment-variables-reference)
7. [Smoke-test checklist](#7-smoke-test-checklist)
8. [Observability and health checks](#8-observability-and-health-checks)
9. [Rollback and teardown](#9-rollback-and-teardown)
10. [Hackathon submission: storage configuration screenshot](#10-hackathon-submission-storage-configuration-screenshot)
11. [Finding your Vercel Team ID and Project ID](#11-finding-your-vercel-team-id-and-project-id)
12. [Scale-out path (not provisioned for MVP)](#12-scale-out-path-not-provisioned-for-mvp)

---

## 1. Prerequisites

### Required tools

| Tool | Version | Why |
|------|---------|-----|
| Node.js | 20 LTS or 22 | Build and CDK synthesis |
| npm | 10+ | Package manager |
| AWS CLI v2 | 2.x | IAM OIDC provider + CDK bootstrap |
| AWS CDK CLI | bundled in devDeps via `aws-cdk` | Infrastructure synthesis + deploy |
| Vercel CLI | `npm install -g vercel` | Project link and production deploy |
| Docker | optional | Local DynamoDB development only |

### Required accounts and access

- An AWS account with sufficient IAM permissions to:
  - Create IAM OIDC providers
  - Create IAM roles and inline policies
  - Run `cdk bootstrap` (creates an S3 bucket and ECR repo in the target account)
  - Create DynamoDB tables
- A Vercel account with the Pulse project imported from the repository.

### Local validation (before touching AWS)

Verify the CDK synthesis works completely offline:

```bash
npm run cdk:synth
```

This command produces the full CloudFormation YAML for the DynamoDB table, both GSIs, Streams, TTL, and PITR. It requires no AWS credentials. If this command exits with code 0, the infrastructure definition is correct.

---

## 2. Architecture recap

```
Browser (audience / host)
        |
        v
Vercel Edge CDN
        |
        v
Next.js Route Handlers (Node.js runtime on Vercel)
        |
        | AssumeRoleWithWebIdentity (short-lived OIDC token)
        v
IAM Role: PulseVercelRole  (least-privilege, data-plane only)
        |
        v
DynamoDB table "Pulse"  (single-table, PAY_PER_REQUEST)
  ├── GSI1: gsi1pk / gsi1sk  (code → event lookup)
  ├── GSI2: gsi2pk / gsi2sk  (leaderboard top-N)
  ├── Streams: NEW_AND_OLD_IMAGES  (reserved for future fan-out)
  └── TTL attribute: ttl
```

No AWS access keys are ever stored in Vercel, in the repository, or in any configuration file. Every request vends short-lived credentials via OIDC.

---

## 3. Step-by-step rollout

### 3.1 Bootstrap the Vercel ↔ AWS OIDC trust

This step creates an IAM OIDC identity provider for Vercel and an IAM role with a least-privilege DynamoDB policy. It provisions **no data resources**.

```bash
# Interactive mode (recommended for first run)
npm run deploy:init-aws

# Non-interactive dry run (print-only, creates nothing)
DRY_RUN=true npm run deploy:init-aws

# Pre-set env vars to skip prompts
AWS_REGION=us-east-1 \
VERCEL_TEAM_ID=team_xxxxxxxxxxxxxxxxxxxx \
VERCEL_PROJECT_ID=prj_xxxxxxxxxxxxxxxxxxxx \
PULSE_TABLE_NAME=Pulse \
npm run deploy:init-aws
```

The script will:

1. Verify your AWS CLI is authenticated (`aws sts get-caller-identity`).
2. Print every AWS CLI command before running it.
3. Prompt for explicit `yes` confirmation before any AWS write.
4. Create or verify the IAM OIDC provider at `oidc.vercel.com/<team-id>`.
5. Create or update the IAM role `PulseVercelRole` with the correct trust policy.
6. Attach the least-privilege inline policy `PulseDynamoDBDataPlane`.
7. Print the `AWS_ROLE_ARN` to paste into Vercel.

**Output to capture:** the `AWS_ROLE_ARN` printed at the end, which looks like:

```
arn:aws:iam::<account-id>:role/PulseVercelRole
```

### 3.2 Provision DynamoDB infrastructure

```bash
# Interactive (recommended)
npm run deploy:infra

# Dry run — synth only, no deploy
DRY_RUN=true npm run deploy:infra

# CI / non-interactive
FORCE=true PULSE_TABLE_NAME=Pulse AWS_REGION=us-east-1 \
VERCEL_ROLE_ARN=arn:aws:iam::<account>:role/PulseVercelRole \
npm run deploy:infra
```

The script will:

1. Always run `cdk synth PulseStack` first (offline-safe) and display the CloudFormation template for review.
2. Abort cleanly if you decline without creating anything.
3. On confirmation, run `cdk deploy PulseStack --require-approval broadening --outputs-file cdk-outputs.json`.
4. Write `infra/cdk-outputs.json` with the table name, table ARN, and stream ARN.

**Before running `deploy:infra`**, CDK must be bootstrapped in the target account/region **once**:

```bash
# Run once per account/region — creates the CDK toolkit S3 bucket
cd infra && npx cdk bootstrap aws://<account-id>/<region>
```

**Recommended:** set `VERCEL_ROLE_ARN` before running `deploy:infra` so the stack applies the IAM grant in the same deployment. If you deploy the table first without the role ARN, re-run `deploy:infra` after creating the role in 3.1 to apply the grant.

### 3.3 Configure Vercel environment variables

In the Vercel dashboard, go to your project > **Settings** > **Environment Variables**. Set these for the **Production** environment:

| Variable | Value | Source |
|----------|-------|--------|
| `PULSE_DB_MODE` | `aws` | Hard-coded for prod |
| `PULSE_TABLE_NAME` | `Pulse` | From `infra/cdk-outputs.json` TableName output |
| `AWS_REGION` | `us-east-1` | Must match CDK stack region |
| `AWS_ROLE_ARN` | `arn:aws:iam::<account>:role/PulseVercelRole` | Output of `deploy:init-aws` |
| `PULSE_SESSION_SECRET` | 32+ byte random value | **Required in production.** Generate: `openssl rand -base64 32` |
| `OPENAI_API_KEY` | `sk-...` | Optional: enables AI assist features |
| `SSE_INTERVAL_MS` | `1000` | Optional: default 1000ms |
| `SSE_CACHE_TTL_MS` | `500` | Optional: default 500ms |
| `JUDGING_WINDOW_DAYS` | `30` | Optional: TTL for durable items |
| `SHARD_COUNT` | `10` | Optional: write-sharding parallelism |

`PULSE_SESSION_SECRET` MUST be set to a strong random value in production. Without it, the app runs with a fixed dev-only fallback that makes participant cookies forgeable.

Vercel also exposes `VERCEL_OIDC_TOKEN` automatically at runtime — this is consumed by `@vercel/oidc-aws-credentials-provider` to vend the STS token. You do not set this manually.

### 3.4 Deploy the Next.js app to Vercel

**Option A — Vercel CLI (recommended for first deployment):**

```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# Link to your Vercel project (interactive first time)
vercel link

# Deploy to production (this is the GATED production command — see Section 4)
vercel --prod
```

**Option B — GitHub automatic deployment:**

1. In the Vercel dashboard, go to **New Project** > **Import Git Repository**.
2. Select the Pulse repository.
3. Accept the default build settings (Next.js auto-detected).
4. Vercel will deploy on every push to `main`.

---

## 4. The single gated production command

After completing steps 3.1–3.3, the complete production deployment is a single command:

```bash
vercel --prod
```

What this does:

1. Vercel builds the Next.js application (`next build`).
2. Vercel deploys the build artifacts to the global Vercel CDN.
3. At runtime, when the first request hits an API route, `@vercel/oidc-aws-credentials-provider` exchanges the Vercel OIDC token for short-lived AWS credentials using `AssumeRoleWithWebIdentity`.
4. The short-lived credentials access DynamoDB using only the data-plane permissions in `PulseVercelRole`.

**Confirmation points:**

| Step | Gate |
|------|------|
| OIDC bootstrap (`deploy:init-aws`) | Types `yes` at the prompt before any IAM write |
| Infrastructure deploy (`deploy:infra`) | Types `yes` at the prompt after reviewing `cdk synth` output |
| App deployment (`vercel --prod`) | Vercel CLI shows a preview URL and asks to promote to production |
| CDK bootstrap (one-time) | No gate — bootstrap is a prerequisite operation, not a data-resource change |

Nothing provisions until you type `yes`. `DRY_RUN=true` mode exists for both scripts if you want to inspect without committing.

---

## 5. OIDC trust policy and IAM policy shapes

### Trust policy on `PulseVercelRole`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<account-id>:oidc-provider/oidc.vercel.com/<team-id>"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.vercel.com/<team-id>:aud": "https://aws.amazon.com/oidc",
          "oidc.vercel.com/<team-id>:sub": "owner:<team-id>:project:<project-id>:environment:production"
        }
      }
    }
  ]
}
```

The `sub` condition scopes the role to this specific Vercel project running in the `production` environment. The `aud` condition locks the audience to the standard AWS OIDC audience. This prevents any other Vercel project — even within the same team — from assuming this role.

### Inline data-plane policy `PulseDynamoDBDataPlane`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PulseDynamoDBDataPlane",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:BatchGetItem",
        "dynamodb:TransactWriteItems",
        "dynamodb:ConditionCheckItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:<region>:<account-id>:table/Pulse",
        "arn:aws:dynamodb:<region>:<account-id>:table/Pulse/index/*"
      ]
    }
  ]
}
```

This policy grants no admin-plane permissions (`CreateTable`, `DeleteTable`, `UpdateTable`, `DescribeTable`, `UpdateTimeToLive` are all denied by absence). The app can only read and write items on the named table and its indexes.

---

## 6. Vercel environment variables reference

Full variable contract (mirrors `.env.example`):

```
# Required in production
PULSE_DB_MODE=aws
PULSE_TABLE_NAME=Pulse
AWS_REGION=us-east-1
AWS_ROLE_ARN=arn:aws:iam::<account>:role/PulseVercelRole
PULSE_SESSION_SECRET=<openssl rand -base64 32>

# Optional — set by Vercel automatically
# VERCEL_OIDC_TOKEN  (injected by Vercel runtime, do not set manually)

# Optional tuning (defaults shown)
SSE_INTERVAL_MS=1000
SSE_CACHE_TTL_MS=500
JUDGING_WINDOW_DAYS=30
REACTION_TTL_SEC=600
PRESENCE_TTL_SEC=15
OPS_WRITES_TTL_SEC=60
OPS_WINDOW_SEC=5
SHARD_COUNT=10

# Optional — AI assist (feature hides itself when absent)
OPENAI_API_KEY=sk-...
```

Local development uses `PULSE_DB_MODE=local` and connects to DynamoDB Local via Docker:

```bash
npm run dev:local   # starts Docker DynamoDB Local, creates table schema, then next dev
```

---

## 7. Smoke-test checklist

Run these checks immediately after a production deployment:

- [ ] `GET /` responds with HTTP 200 — landing page loads.
- [ ] `POST /api/events` with `{ "title": "Smoke Test" }` returns `{ "eventId": "...", "code": "...", "hostToken": "..." }` with HTTP 200.
- [ ] `GET /join/<code>` responds with HTTP 200 — audience join page loads.
- [ ] `POST /api/join` with `{ "code": "<code>", "displayName": "Tester" }` returns `{ "participantId": "..." }` with HTTP 200.
- [ ] `GET /api/stream/<eventId>` opens an SSE connection and emits `event: snapshot` within 3 seconds.
- [ ] `GET /api/leaderboard?eventId=<eventId>` returns HTTP 200 with a `participants` array.
- [ ] Host console at `/host/<eventId>/<hostToken>` loads with HTTP 200.
- [ ] Launching a `mc_poll` moment via `POST /api/events/<eventId>/moments` returns HTTP 200.
- [ ] A vote via `POST /api/votes` updates the poll tally visible in the SSE stream.
- [ ] Closing the event via `POST /api/events/<eventId>` with `{ "action": "close" }` returns HTTP 200.
- [ ] Vercel function logs (Vercel dashboard > Logs) show no unhandled errors.
- [ ] AWS CloudWatch metrics for the DynamoDB table show successful reads/writes (no throttling or errors in the first 5 minutes).

---

## 8. Observability and health checks

### Application logging

All server-side events are logged via `src/lib/observability/log.ts` using structured JSON to `stdout`. Vercel captures all stdout as Vercel function logs, accessible in the Vercel dashboard under **Logs**.

Log schema:

```json
{ "level": "info|warn|error", "msg": "...", "eventId": "...", "momentId": "...", "errorType": "..." }
```

### DynamoDB monitoring

In the AWS console, navigate to **DynamoDB > Tables > Pulse > Metrics**:

- **SuccessfulRequestLatency**: should be under 5ms for GetItem/PutItem at MVP scale.
- **ConsumedReadCapacityUnits / ConsumedWriteCapacityUnits**: on-demand table, no throttling unless burst exceeds 40,000 WCU/s (not a concern at hackathon scale).
- **ThrottledRequests**: should be 0 at MVP scale.
- **SystemErrors**: should be 0.

### Health endpoint

There is no dedicated `/health` endpoint. The smoke-test `GET /` serves as the health check. A future hardening step would add `GET /api/health` that returns `{ "status": "ok", "db": "connected" }` after a lightweight `DescribeTable` or `GetItem` probe.

### Vercel function cold starts

Vercel Node.js functions cold-start in approximately 200–400ms. The DynamoDB client is a module-level singleton (created once per warm instance), so warm-path DynamoDB latency is the DynamoDB round-trip only (~1–3ms us-east-1).

---

## 9. Rollback and teardown

### Rollback: redeploy previous version

Vercel maintains a deployment history. To roll back:

```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel promote <deployment-url>
```

Or in the Vercel dashboard: **Deployments** > find the previous deployment > **Promote to Production**.

The DynamoDB table is unaffected by a Vercel rollback. Schema and data are independent of the frontend deployment.

### Rollback: infrastructure

If the CDK stack deployment must be reversed (e.g., to remove the GSIs or change billing mode), run:

```bash
cd infra && npx cdk deploy PulseStack --require-approval broadening
```

This applies a change set, not a destroy. Always prefer an update over a destroy.

### Teardown: remove the CloudFormation stack

```bash
cd infra && npx cdk destroy PulseStack
```

**CRITICAL: the DynamoDB table has `RemovalPolicy.RETAIN`.**

The `cdk destroy` command will remove the CloudFormation stack but will **NOT delete the DynamoDB table**. The table continues to exist in your AWS account and incurs no on-demand charges when idle (DynamoDB PAY_PER_REQUEST has no minimum charge). To permanently delete the table:

```bash
aws dynamodb delete-table --table-name Pulse --region us-east-1
```

Only run this if you are certain you want to permanently delete all event data.

### Teardown: IAM OIDC provider and role

```bash
# Delete the inline policy first
aws iam delete-role-policy --role-name PulseVercelRole --policy-name PulseDynamoDBDataPlane

# Delete the role
aws iam delete-role --role-name PulseVercelRole

# Delete the OIDC provider (replace <team-id> and <account-id>)
aws iam delete-open-id-connect-provider \
  --open-id-connect-provider-arn arn:aws:iam::<account-id>:oidc-provider/oidc.vercel.com/<team-id>
```

---

## 10. Hackathon submission: storage configuration screenshot

To capture the required DynamoDB storage configuration screenshot for the hackathon submission:

1. Open the AWS Console at `https://console.aws.amazon.com/dynamodb`.
2. Select the correct region (us-east-1 by default).
3. Navigate to **Tables** > **Pulse**.
4. Click the **Overview** tab. This shows:
   - Table name: `Pulse`
   - Billing mode: `On-demand`
   - Primary key: `pk (S)` and `sk (S)`
   - Streams: `Enabled`
   - Point-in-time recovery: `Enabled`
5. Click the **Indexes** tab. This shows:
   - GSI1: `gsi1pk (S)` / `gsi1sk (S)`, ProjectionType: ALL
   - GSI2: `gsi2pk (S)` / `gsi2sk (S)`, ProjectionType: ALL
6. Take a screenshot showing the table name, billing mode, and indexes visible simultaneously.
7. Optionally, capture the **Additional settings** tab to show TTL enabled on the `ttl` attribute.

This screenshot demonstrates the single-table design with two GSIs and PAY_PER_REQUEST billing as required by the hackathon rubric.

---

## 11. Finding your Vercel Team ID and Project ID

### Team ID

1. Open `https://vercel.com/dashboard`.
2. Click your team name in the top-left selector.
3. Navigate to **Settings** > **General**.
4. The **Team ID** is shown under the team name. It looks like `team_xxxxxxxxxxxxxxxxxxxx`.

Alternatively, via the Vercel CLI:

```bash
vercel whoami
vercel teams list
```

### Project ID

1. Open your project in the Vercel dashboard.
2. Navigate to **Settings** > **General**.
3. The **Project ID** is shown near the top. It looks like `prj_xxxxxxxxxxxxxxxxxxxx`.

Alternatively, via the Vercel CLI after linking:

```bash
cat .vercel/project.json
```

The `projectId` field is the Project ID.

---

## 12. Scale-out path (not provisioned for MVP)

The following architecture is documented as the production scale-out path. **None of these components are provisioned for the hackathon MVP.** The MVP uses SSE from a single Vercel function per event, which supports approximately 1,000 concurrent audience members per event before Vercel function connection limits become the bottleneck (assumption A-20).

### DynamoDB Streams → Lambda → WebSocket fan-out

```
DynamoDB Streams (NEW_AND_OLD_IMAGES, already enabled on the Pulse table)
        |
        v
Lambda function: pulse-stream-consumer
  - Reads from the DynamoDB Stream (event source mapping)
  - Parses NEW_IMAGE / OLD_IMAGE delta into a typed snapshot diff
  - Publishes diff to API Gateway WebSocket connections via PostToConnection
        |
        v
API Gateway WebSocket API: wss://ws.<domain>/pulse
  - Connection table: separate DynamoDB table (connectionId → eventId)
  - @connect route: stores connectionId + eventId
  - @disconnect route: removes connectionId
  - $default route: unused (server pushes only)
        |
        v
Browser WebSocket clients (millions of concurrent connections)
```

**Additional components for the scale-out path:**

| Component | Purpose | Not provisioned because |
|-----------|---------|------------------------|
| Lambda (DynamoDB Streams consumer) | Push diffs to WebSocket clients | SSE covers MVP scale |
| API Gateway WebSocket API | Broadcast WebSocket connections | SSE covers MVP scale |
| Connection registry (DynamoDB or ElastiCache) | Map connectionId to eventId | Requires separate ops |
| Vercel Edge Middleware + Upstash Redis | Shared rate limiting across function instances | In-process limiter sufficient at hackathon scale |
| CloudFront + S3 | Static asset edge caching | Vercel CDN covers this |
| ElastiCache for Redis | Leaderboard aggregation cache | PAY_PER_REQUEST DynamoDB sufficient at MVP scale |

**Wiring the scale-out path** (future work, not for MVP):

1. Create a Lambda function with an IAM role granting `dynamodb:GetRecords`, `dynamodb:GetShardIterator`, `dynamodb:DescribeStream`, `dynamodb:ListStreams` on the Pulse stream ARN.
2. Add an Event Source Mapping from the DynamoDB Stream to the Lambda.
3. Create an API Gateway WebSocket API with Lambda integrations for `@connect`, `@disconnect`, and the diff-push handler.
4. Add `execute-api:ManageConnections` to the Lambda role for the WebSocket API ARN.
5. Update the client transport in `src/hooks/useLiveSnapshot.ts` to prefer WebSocket when available, falling back to SSE.
6. The DynamoDB table and both GSIs require no changes — the stream is already enabled.
