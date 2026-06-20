/**
 * scripts/init-local-table.ts
 *
 * Creates the Pulse DynamoDB table on DynamoDB Local.
 * Idempotent: skips creation if the table already exists.
 *
 * Run with: npm run ddb:init
 * NFR-06.1.
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceInUseException,
} from "@aws-sdk/client-dynamodb";

// ── Environment setup (replicate the local client config) ────────────────────
process.env.PULSE_DB_MODE = process.env.PULSE_DB_MODE ?? "local";
process.env.PULSE_TABLE_NAME = process.env.PULSE_TABLE_NAME ?? "Pulse";
process.env.AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
process.env.DYNAMODB_LOCAL_ENDPOINT =
  process.env.DYNAMODB_LOCAL_ENDPOINT ?? "http://localhost:8000";

const endpoint = process.env.DYNAMODB_LOCAL_ENDPOINT;
const tableName = process.env.PULSE_TABLE_NAME;
const region = process.env.AWS_REGION;

const client = new DynamoDBClient({
  endpoint,
  region,
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});

async function tableExists(): Promise<boolean> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch {
    return false;
  }
}

async function createTable(): Promise<void> {
  console.log(`Creating table "${tableName}" on ${endpoint}...`);

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "pk", AttributeType: "S" },
        { AttributeName: "sk", AttributeType: "S" },
        { AttributeName: "gsi1pk", AttributeType: "S" },
        { AttributeName: "gsi1sk", AttributeType: "S" },
        { AttributeName: "gsi2pk", AttributeType: "S" },
        { AttributeName: "gsi2sk", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "pk", KeyType: "HASH" },
        { AttributeName: "sk", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "gsi1pk", KeyType: "HASH" },
            { AttributeName: "gsi1sk", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
        {
          IndexName: "GSI2",
          KeySchema: [
            { AttributeName: "gsi2pk", KeyType: "HASH" },
            { AttributeName: "gsi2sk", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
      StreamSpecification: {
        StreamEnabled: true,
        StreamViewType: "NEW_AND_OLD_IMAGES",
      },
    })
  );

  console.log(`Table "${tableName}" created successfully.`);
  console.log(`  GSI1: code -> event resolution`);
  console.log(`  GSI2: leaderboard top-N`);
  console.log(`  Streams: NEW_AND_OLD_IMAGES (scale-out path, not consumed for MVP)`);
}

async function main(): Promise<void> {
  if (await tableExists()) {
    console.log(`Table "${tableName}" already exists — skipping creation.`);
    return;
  }

  try {
    await createTable();
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      console.log(`Table "${tableName}" already exists — skipping.`);
      return;
    }
    console.error("Failed to create table:", err);
    process.exit(1);
  }
}

main();
