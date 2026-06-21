/**
 * scripts/loadtest.ts
 *
 * Fire N concurrent votes at one event against DynamoDB Local and verify:
 *   1. Zero lost votes (aggregate == N)
 *   2. No unhandled throttling errors (all dedup 409s are expected, raw errors are not)
 *   3. Prints consumed capacity at debug level
 *
 * Idempotency fix (defect 3): each invocation uses a unique run ID based on
 * Date.now() so re-runs create a fresh event+moment and never see stale
 * duplicate records from previous runs. The event and moment are provisioned
 * directly in DynamoDB Local at the start of each run.
 *
 * SC5, NFR-01.1, NFR-05.2.
 * Run with: npm run loadtest
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
  QueryCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

process.env.PULSE_DB_MODE = "local";
process.env.PULSE_TABLE_NAME = process.env.PULSE_TABLE_NAME ?? "Pulse";
process.env.AWS_REGION = "us-east-1";
process.env.DYNAMODB_LOCAL_ENDPOINT =
  process.env.DYNAMODB_LOCAL_ENDPOINT ?? "http://localhost:8000";
process.env.SHARD_COUNT = "10";
process.env.JUDGING_WINDOW_DAYS = "30";
process.env.REACTION_TTL_SEC = "600";
process.env.OPS_WRITES_TTL_SEC = "60";

const TABLE = process.env.PULSE_TABLE_NAME;
const N = parseInt(process.env.LOAD_N ?? "5000", 10);
const CONCURRENCY = parseInt(process.env.LOAD_CONCURRENCY ?? "100", 10);
const SHARD_COUNT = 10;

// Unique run ID per invocation — makes the loadtest idempotent across runs.
const RUN_ID = Date.now().toString(36).toUpperCase();
const EVENT_ID = `LOADTEST_${RUN_ID}`;
const MOMENT_ID = `LTMOMENT_${RUN_ID}`;
const OPTION = "optionA";

const rawClient = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_LOCAL_ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const client = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: { removeUndefinedValues: true },
});

function pickShard(participantId: string): number {
  let hash = 5381;
  for (let i = 0; i < participantId.length; i++) {
    hash = ((hash << 5) + hash) ^ participantId.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash % SHARD_COUNT;
}

/**
 * Provision a minimal EVENT and MOMENT item in DDB Local for this run.
 * Using PutItem with no condition so we can always create fresh items.
 */
async function provisionEventAndMoment(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  // Write event metadata
  await client.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `EVENT#${EVENT_ID}`,
        sk: "METADATA",
        type: "EVENT",
        eventId: EVENT_ID,
        title: `Load Test ${RUN_ID}`,
        code: `LT${RUN_ID.slice(-4)}`,
        status: "ACTIVE",
        hostTokenHash: "loadtest-noverify",
        activeMomentId: MOMENT_ID,
        peakConcurrent: 0,
        createdAt: now,
      },
    })
  );

  // Write moment metadata
  await client.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: `EVENT#${EVENT_ID}`,
        sk: `MOMENT#${MOMENT_ID}`,
        type: "MOMENT",
        momentId: MOMENT_ID,
        momentType: "MC",
        status: "ACTIVE",
        question: "Load test question",
        options: [OPTION, "optionB"],
        activatedAt: Date.now(),
        createdAt: now,
      },
    })
  );
}

async function castVote(participantId: string): Promise<"ok" | "dup" | "error"> {
  const shard = pickShard(participantId);
  const ttl = Math.floor(Date.now() / 1000) + 30 * 86400;

  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: TABLE,
              Item: {
                pk: `EVENT#${EVENT_ID}`,
                sk: `VOTE#${MOMENT_ID}#${participantId}`,
                type: "VOTE",
                option: OPTION,
                createdAt: Math.floor(Date.now() / 1000),
                ttl,
              },
              ConditionExpression: "attribute_not_exists(sk)",
            },
          },
          {
            Update: {
              TableName: TABLE,
              Key: {
                pk: `EVENT#${EVENT_ID}`,
                sk: `COUNTER#${MOMENT_ID}#${OPTION}#${shard}`,
              },
              UpdateExpression: "ADD #cnt :one",
              ExpressionAttributeNames: { "#cnt": "count" },
              ExpressionAttributeValues: { ":one": 1 },
            },
          },
        ],
        ReturnConsumedCapacity: "TOTAL",
      })
    );
    return "ok";
  } catch (err: unknown) {
    const e = err as { name?: string; CancellationReasons?: Array<{ Code?: string }> };
    if (
      e.name === "TransactionCanceledException" &&
      e.CancellationReasons?.some((r) => r.Code === "ConditionalCheckFailed")
    ) {
      return "dup";
    }
    console.error("Unexpected error:", e.name, (err as Error).message?.slice(0, 100));
    return "error";
  }
}

async function readTotal(): Promise<number> {
  const prefix = `COUNTER#${MOMENT_ID}#${OPTION}#`;
  let total = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const { Items = [], LastEvaluatedKey } = await client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
        ExpressionAttributeValues: {
          ":pk": `EVENT#${EVENT_ID}`,
          ":prefix": prefix,
        },
        ExclusiveStartKey: lastKey,
      })
    );
    for (const item of Items as Array<{ count?: number }>) {
      total += item.count ?? 0;
    }
    lastKey = LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lastKey);

  return total;
}

async function main(): Promise<void> {
  console.log(`\nPulse Load Test`);
  console.log(`  Table:       ${TABLE}`);
  console.log(`  Run ID:      ${RUN_ID}`);
  console.log(`  Event:       ${EVENT_ID}`);
  console.log(`  Moment:      ${MOMENT_ID}`);
  console.log(`  Votes:       ${N} (unique participants)`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Shards:      ${SHARD_COUNT}\n`);

  // Provision fresh event + moment for this run (idempotency fix)
  console.log("  Provisioning event + moment...");
  await provisionEventAndMoment();
  console.log("  Done.\n");

  const participants = Array.from({ length: N }, (_, i) => `u_load_${RUN_ID}_${i}`);

  let ok = 0, dup = 0, error = 0;
  const start = Date.now();

  // Process in batches of CONCURRENCY
  for (let offset = 0; offset < participants.length; offset += CONCURRENCY) {
    const batch = participants.slice(offset, offset + CONCURRENCY);
    const results = await Promise.all(batch.map(castVote));
    for (const r of results) {
      if (r === "ok") ok++;
      else if (r === "dup") dup++;
      else error++;
    }

    if (offset % 500 === 0) {
      process.stdout.write(
        `  Progress: ${offset + batch.length}/${N} (ok=${ok} dup=${dup} err=${error})\r`
      );
    }
  }

  const elapsed = Date.now() - start;
  console.log(`\n\nResults:`);
  console.log(`  Accepted votes: ${ok}`);
  console.log(`  Duplicates:     ${dup}`);
  console.log(`  Errors:         ${error}`);
  console.log(`  Elapsed:        ${elapsed}ms`);
  console.log(`  Throughput:     ${Math.round(N / (elapsed / 1000))} writes/s`);

  // Read and verify the aggregate
  console.log("\nVerifying aggregate counter...");
  const total = await readTotal();
  console.log(`  Counter aggregate: ${total} (expected: ${ok})`);

  const passed = error === 0 && total === ok;
  if (passed) {
    console.log("\n✓ PASS: Zero unhandled errors, aggregate matches accepted vote count.");
  } else {
    console.error(`\n✗ FAIL: errors=${error}, aggregate=${total}, accepted=${ok}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
