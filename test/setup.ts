/**
 * Global test setup — runs before any module is evaluated.
 * Sets the minimum required environment variables so that client.ts
 * module-level guards do not throw during unit tests that import
 * lib/dynamo modules indirectly.
 */

// These are test-safe dummy values. No real AWS calls are made in unit tests.
process.env.PULSE_TABLE_NAME = process.env.PULSE_TABLE_NAME ?? "Pulse-Test";
process.env.PULSE_DB_MODE = process.env.PULSE_DB_MODE ?? "local";
process.env.AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
process.env.DYNAMODB_LOCAL_ENDPOINT =
  process.env.DYNAMODB_LOCAL_ENDPOINT ?? "http://localhost:8000";
process.env.SHARD_COUNT = process.env.SHARD_COUNT ?? "10";
