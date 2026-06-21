# ADR-004: Vercel OIDC for AWS Credentials (No Stored Keys)

**Status:** Accepted  
**Date:** 2026-06-20

---

## Context

Pulse's Route Handlers need to call DynamoDB at runtime. The naive approach is to store `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` as Vercel environment variables. This means long-lived static credentials that:

- Appear in Vercel's env var UI and are accessible to anyone with project access.
- Are logged if accidentally printed.
- Can never be "short-lived" — rotation requires a manual secret update.
- Violate the hackathon's explicit requirement: _no AWS credentials in the repository_ (SC8, NFR-03.1).

---

## Decision

Use **Vercel OIDC (`AssumeRoleWithWebIdentity`)** for production AWS credentials:

- Vercel automatically injects a short-lived OIDC token (`VERCEL_OIDC_TOKEN`) into the runtime environment of every production deployment.
- `@vercel/oidc-aws-credentials-provider` exchanges this token for temporary AWS credentials via `sts:AssumeRoleWithWebIdentity`, scoped to `PulseVercelRole`.
- `PulseVercelRole` is least-privilege: only data-plane DynamoDB actions (`GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, `Query`, `BatchGetItem`, `TransactWriteItems`, `ConditionCheckItem`) on the named table and its indexes. No admin-plane actions.
- The IAM trust policy uses `StringEquals` conditions on `aud` (AWS OIDC audience) and `sub` (Vercel project + environment = production) to prevent any other Vercel project from assuming the role.

For local development, `PULSE_DB_MODE=local` routes to DynamoDB Local with dummy static credentials (`local`/`local`) that DDB Local ignores. No real AWS credentials are ever needed for local development.

---

## Consequences

**Positive:**

- No long-lived AWS credentials exist in the repository, Vercel environment, logs, or any configuration file. Satisfies NFR-03.1, SC8.
- Credentials are short-lived (STS session tokens, typically 1 hour), reducing the blast radius of any exposure.
- The trust policy restricts the role to a single Vercel project in the production environment — a staging deployment or a forked project cannot assume the role.
- The IAM policy is enforced at the AWS level — even if the application code were compromised, it cannot perform `DeleteTable` or `DescribeTable`.

**Negative / trade-offs:**

- Requires an IAM OIDC provider and an IAM role to be provisioned before the first production deployment. The `npm run deploy:init-aws` script automates this with an explicit confirmation prompt (SC10).
- `@vercel/oidc-aws-credentials-provider` is a Vercel-specific package — switching to a different hosting provider requires swapping the credential provider.
- If `AWS_ROLE_ARN` is absent, `lib/dynamo/client.ts` falls back to the default AWS credential provider chain (instance profile, environment variables) — acceptable for developer machines with `~/.aws/credentials`, but should not reach production without the role ARN set.
