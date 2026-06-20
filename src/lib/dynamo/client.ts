/**
 * DynamoDBDocumentClient singleton.
 *
 * Switches by PULSE_DB_MODE:
 *   "local"  → DynamoDB Local (Docker) with dummy static credentials.
 *   "aws"    → real AWS with Vercel OIDC vending; falls back to the
 *              default credential provider chain when AWS_ROLE_ARN is not set.
 *
 * The singleton is created once per Node.js process and reused across all
 * Route Handlers and SSE ticks to amortise connection overhead.
 *
 * TABLE_NAME and DB_MODE are read lazily (inside getDocClient / getTableName)
 * so that module evaluation during Next.js build-time page-data collection
 * does not require environment variables to be present. The check still fails
 * fast on the first real request at runtime.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// ---------------------------------------------------------------------------
// Lazy env accessors — evaluated on first request, not at module load time.
// ---------------------------------------------------------------------------

/**
 * Returns the DynamoDB table name from the environment.
 * Throws at the first call if the variable is absent (fail-fast at runtime).
 */
export function getTableName(): string {
  const name = process.env.PULSE_TABLE_NAME;
  if (!name) throw new Error("PULSE_TABLE_NAME is required");
  return name;
}

/**
 * TABLE_NAME behaves like a string but resolves lazily via `getTableName()`.
 * The AWS SDK passes it into template expressions (`${TABLE_NAME}`) and object
 * property values — both paths call `toString()` / `valueOf()`, which are
 * intercepted here.
 */
export const TABLE_NAME: string = (() => {
  const lazy = {
    toString(): string { return getTableName(); },
    valueOf(): string { return getTableName(); },
    [Symbol.toPrimitive](): string { return getTableName(); },
  };
  return lazy as unknown as string;
})();

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

function buildClient(): DynamoDBClient {
  const dbMode = process.env.PULSE_DB_MODE ?? "local";
  const region = process.env.AWS_REGION ?? "us-east-1";

  if (dbMode === "local") {
    const endpoint =
      process.env.DYNAMODB_LOCAL_ENDPOINT ?? "http://localhost:8000";
    return new DynamoDBClient({
      endpoint,
      region,
      // Dummy static credentials — DynamoDB Local ignores them.
      credentials: {
        accessKeyId: "local",
        secretAccessKey: "local",
      },
    });
  }

  if (dbMode !== "aws") {
    throw new Error(
      `PULSE_DB_MODE must be "local" or "aws", got "${dbMode}"`
    );
  }

  // --- AWS (prod) path ---
  const roleArn = process.env.AWS_ROLE_ARN;

  if (roleArn) {
    // Vercel OIDC vending. Import is deferred so the local path doesn't
    // try to load the OIDC provider (which fails without the token endpoint).
    const {
      awsCredentialsProvider,
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require("@vercel/oidc-aws-credentials-provider") as {
      awsCredentialsProvider: (opts: { roleArn: string }) => unknown;
    };

    return new DynamoDBClient({
      region,
      credentials: awsCredentialsProvider({ roleArn }) as never,
    });
  }

  // No role ARN → fall back to the default provider chain
  // (instance profile, ~/.aws/credentials, env vars, etc.).
  return new DynamoDBClient({ region });
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _docClient: DynamoDBDocumentClient | null = null;

export function getDocClient(): DynamoDBDocumentClient {
  if (!_docClient) {
    const raw = buildClient();
    _docClient = DynamoDBDocumentClient.from(raw, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: false,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });
  }
  return _docClient;
}

/** Reset the singleton (useful in tests). */
export function resetDocClient(): void {
  _docClient = null;
}
