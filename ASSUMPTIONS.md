# Pulse — Documented Assumptions

> Last updated: 2026-06-20
> Each entry records: what was assumed, why, and how to override it.

---

## Infrastructure and AWS

| ID | Assumption | Rationale | How to Override |
|----|------------|-----------|-----------------|
| A-01 | Default AWS region is `us-east-1`. | Lowest-latency region for most North American hackathon evaluators; default for most AWS tooling. | Set `AWS_REGION=<region>` in `.env.local` and update the CDK/IaC stack region parameter. |
| A-02 | DynamoDB billing mode is PAY_PER_REQUEST (on-demand). | No capacity planning required during development; scales to burst without pre-warming; avoids accidental provisioned-capacity charges. | Change the `billingMode` property in the IaC template to PROVISIONED and supply read/write capacity units. |
| A-03 | A single DynamoDB table covers the entire application (single-table design). | Maximises judging score on "deliberate DynamoDB data model"; reduces operational surface. | Split into multiple tables by changing the data-access layer; update the IaC accordingly. |
| A-04 | DynamoDB Local (Docker image `amazon/dynamodb-local:latest`) is used for local development. | No real AWS credentials required during the build; keeps development cost at zero. | Point `DYNAMODB_ENDPOINT` at a real AWS endpoint and supply valid credentials in `.env.local`. |
| A-05 | No real AWS provisioning occurs during the build phase; IaC deploy is gated behind an explicit confirmation prompt. | Hackathon constraint stated explicitly; prevents accidental credit spend. | Remove the confirmation gate from the deploy script for a non-hackathon production deployment. |
| A-06 | OIDC-based authentication (GitHub Actions OIDC or Vercel OIDC) is the documented production credential path; the IAM role itself is not provisioned during the hackathon. | Fulfils SC8 without requiring real AWS account access during the build. | Provision the OIDC IAM role in the target account following the documented ARN pattern in `docs/deploy.md`. |

---

## Application Architecture

| ID | Assumption | Rationale | How to Override |
|----|------------|-----------|-----------------|
| A-07 | Real-time delivery uses Server-Sent Events (SSE) as the primary mechanism, with HTTP polling (3-second interval) as an automatic fallback. | SSE is natively supported by Next.js Route Handlers on Vercel; simpler operational model than WebSocket for MVP. | Introduce a WebSocket layer (e.g., Ably, Pusher, or a custom EC2/ECS server) and update the client transport module. |
| A-08 | DynamoDB Streams fan-out (Lambda consumer pushing to a broadcast layer) is documented in the codebase but not wired for MVP. | Building full Streams fan-out before core flows work is premature; SSE covers the demo scenario. | Implement a Lambda function subscribed to the DynamoDB Stream and connect it to an EventBridge or SNS/SQS fan-out. |
| A-09 | Write-shard count is set to 10 shards per counter as the minimum; the constant is configurable at build time. | 10 shards distributes a 5,000 write/s burst to ~500 writes/s per shard, well below DynamoDB's 1,000 WCU/s per partition limit. | Increase `SHARD_COUNT` environment variable; the aggregation read loop iterates over all shards, so no other code change is required. |
| A-10 | Aggregate reads collapse all shards in the Next.js API/Route Handler layer (no separate Lambda aggregator). | Simplest viable approach for MVP; read fan-out over 10–60 shard items is negligible at hackathon scale. | Move aggregation to a background process or cache layer (e.g., ElastiCache for Redis) for production-grade scale. |
| A-11 | Host tokens are generated as 128-bit random values encoded as URL-safe base64 (22 characters). | Sufficient entropy to be unguessable; short enough to appear cleanly in a URL path segment. | Increase to 256 bits or switch to signed JWT if session expiry or claims are needed post-hackathon. |
| A-12 | The GSI for leaderboard queries uses `eventId` as the partition key and `score` as the sort key on the participant item type. | Allows `Query` with `ScanIndexForward=false` and `Limit=N` for an O(1) top-N read. | Adjust GSI key schema if the data model changes; the requirement is that no `Scan` is used in the leaderboard path. |

---

## Frontend and Deployment

| ID | Assumption | Rationale | How to Override |
|----|------------|-----------|-----------------|
| A-13 | The frontend is Next.js 14+ with the App Router and TypeScript strict mode. | Matches hackathon stack requirement; App Router enables Route Handlers for SSE. | Downgrade to Pages Router by restructuring `app/` to `pages/`; SSE via Pages Router requires a custom server. |
| A-14 | Deployment target is Vercel; the Vercel project is connected to the repository's main branch. | Hackathon requirement. | Deploy to any Node.js-compatible host (Netlify, Fly.io, AWS App Runner) by exporting as a standalone Next.js build. |
| A-15 | Package manager is `npm`. Scripts in this document use `npm run <script>`. | Widest default compatibility; no assumption about Yarn or pnpm availability in the judge's environment. | Replace `npm` with `pnpm` or `yarn` throughout `package.json` scripts; update CI commands accordingly. |
| A-16 | The event join URL pattern is `/join/{code}` and the host console URL pattern is `/host/{eventId}/{hostToken}`. | Simple, readable, and avoids a server-side session requirement for MVP. | Add a server-side session store (e.g., iron-session) and shorten the host URL to `/host/{eventId}` with a cookie-backed token. |
| A-17 | The application is English-only for the hackathon submission. | Internationalisation adds scope without judging benefit. | Add `next-intl` or equivalent and extract all strings to a locale file. |

---

## Audience and Participation Model

| ID | Assumption | Rationale | How to Override |
|----|------------|-----------|-----------------|
| A-18 | Audience members are fully anonymous; the only identity is a display name + a server-generated participant ID stored in `sessionStorage`. | Stated constraint; reduces join friction to near zero; avoids auth complexity. | Add OAuth or magic-link auth by wrapping the participant flow in NextAuth.js. |
| A-19 | A participant ID is bound to a browser session. Clearing storage or opening a new private window creates a new participant identity. | Acceptable for live-event use; abuse vectors (repeat voting) are mitigated server-side by the participant ID conditional write. | Fingerprint the device at a coarser level (IP + user-agent hash) for additional abuse mitigation; note privacy trade-offs. |
| A-20 | Maximum simultaneous audience members per event for MVP demo purposes is approximately 1,000. SC5 tests 5,000 writes (which may come from fewer users sending multiple interactions). | Hackathon demo scenario; the data model supports higher scale by design but the SSE fan-out from a single Vercel function is the practical ceiling without Streams. | Add Streams fan-out or a dedicated broadcast service to support tens of thousands of concurrent SSE connections. |

---

## Moment Design

| ID | Assumption | Rationale | How to Override |
|----|------------|-----------|-----------------|
| A-21 | Only one moment can be active per event at any given time. | Simplifies the control flow, SSE subscription model, and host UX. | Allow parallel moments by adding a `momentState` map in the event item and updating the SSE filter logic. |
| A-22 | The fixed emoji palette for reaction bursts is: 🔥 ❤️ 😂 👏 😮 🎉. | Six high-engagement emoji that cover the most common live-event reactions; defined at build time to avoid upload infrastructure. | Replace the `EMOJI_PALETTE` constant in the shared config file; no other code change required. |
| A-23 | Trivia point formula is: `base_points * (time_remaining / time_limit)` rounded to the nearest integer, where `base_points = 1000`. | Simple, familiar to participants from Kahoot-style games; easy to explain on-screen. | Replace the scoring function in the trivia service module; the leaderboard GSI is agnostic to the scoring formula. |
| A-24 | Word-cloud submissions are stored as raw lowercased strings; no server-side stemming or deduplication beyond case normalisation. | Sufficient for demo; avoids NLP dependency. | Add a lightweight stemming step (e.g., `natural` npm package) before persisting submissions. |

---

## Stretch Features

| ID | Assumption | Rationale | How to Override |
|----|------------|-----------|-----------------|
| A-25 | The OpenAI API (gpt-4o-mini or latest available) is used for AI assist features. | Consistent with the hackathon's OpenAI sponsorship and the developer's existing model access. | Change the model ID in the AI service module; the API call signature is model-agnostic. |
| A-26 | AI assist features are rendered only when `OPENAI_API_KEY` is present in the environment; otherwise the UI element is hidden entirely. | Graceful degradation with no runtime errors. | Make the feature always visible but show a "not configured" state when the key is absent. |

---

## Testing and Quality

| ID | Assumption | Rationale | How to Override |
|----|------------|-----------|-----------------|
| A-27 | Test framework is Vitest for unit/integration tests and Playwright for E2E tests. | Fast, TypeScript-native, compatible with Next.js App Router; Playwright is required by project testing standards. | Replace Vitest with Jest; replace Playwright with Cypress; update `package.json` scripts accordingly. |
| A-28 | The load test script (`npm run load-test`) targets DynamoDB Local and uses Node.js with the AWS SDK v3. | No real AWS account or cost required; SDK v3 supports DynamoDB Local via endpoint override. | Point the script at a real DynamoDB table by removing the endpoint override; set real credentials. |
| A-29 | Minimum unit/integration test coverage target is 80% of business-logic modules (data-access layer, moment service, scoring). Purely presentational React components are covered by visual regression, not unit tests. | Consistent with project testing standards. | Adjust the Vitest coverage threshold in `vitest.config.ts`. |

---

## Naming and Branding

| ID | Assumption | Rationale | How to Override |
|----|------------|-----------|-----------------|
| A-30 | The working product name "Pulse" is provisional and used throughout the codebase as the app name. | Orchestrator noted it is provisional; using a concrete name avoids placeholder strings. | Do a project-wide find-and-replace on the string "Pulse" before any public launch. |
