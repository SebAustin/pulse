/**
 * infra/cdk/pulse-stack.ts
 *
 * AWS CDK stack that provisions the Pulse DynamoDB table.
 *
 * Design decisions traced to PLAN §3.3 / DESIGN §3.2:
 *   - Single table "Pulse" (or env-overridden name) with pk/sk
 *   - GSI1: gsi1pk / gsi1sk — code-to-event lookup
 *   - GSI2: gsi2pk / gsi2sk (number-typed gsi2sk for leaderboard top-N without Scan)
 *   - Streams: NEW_AND_OLD_IMAGES (Streams → Lambda fan-out documented, not built — A-08)
 *   - On-demand billing (PAY_PER_REQUEST) — no capacity planning for demo (A-07)
 *   - Scoped TTL on the `ttl` attribute
 *
 * To synthesize: `cd infra && cdk synth` (requires AWS CDK CLI and CDK bootstrap).
 * To deploy:     `cd infra && cdk deploy` (requires AWS credentials with required IAM permissions).
 */

import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";

export interface PulseStackProps extends cdk.StackProps {
  /** Override the table name (default: "Pulse"). */
  tableName?: string;
  /**
   * ARN of the Vercel OIDC AWS role that the app will assume at runtime.
   * When provided, the role is granted least-privilege access to the table.
   * When omitted, no IAM grants are applied (you manage them separately).
   */
  vercelRoleArn?: string;
}

export class PulseStack extends cdk.Stack {
  /** The DynamoDB table — exposed so other stacks can reference it. */
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: PulseStackProps = {}) {
    super(scope, id, props);

    const tableName = props.tableName ?? "Pulse";

    // ── Table ───────────────────────────────────────────────────────────────

    this.table = new dynamodb.Table(this, "PulseTable", {
      tableName,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Streams enabled but NOT consumed (A-08). Available for a future
      // Lambda fan-out that pushes real-time events to WebSocket clients.
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      // Scoped TTL — only items with a `ttl` attribute are expired.
      // VOTE# dedup items have a long TTL (JUDGING_WINDOW_DAYS days),
      // REACTION# and CONN# have short TTLs.
      timeToLiveAttribute: "ttl",
      // Point-in-time recovery for production safety.
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Never accidentally delete production data
    });

    // ── GSI1: Code → Event lookup (AP-3) ────────────────────────────────────

    this.table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── GSI2: Leaderboard top-N (AP-16) ─────────────────────────────────────
    //
    // gsi2sk is stored as a ZERO-PADDED string ("0000000500#u_participantId")
    // so lexicographic ordering equals numeric ordering — enables top-N via
    // Query(ScanIndexForward=false, Limit=N) with no Scan ever (SC6).

    this.table.addGlobalSecondaryIndex({
      indexName: "GSI2",
      partitionKey: { name: "gsi2pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi2sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── IAM: Vercel OIDC role grant ──────────────────────────────────────────
    //
    // Least-privilege grant: the app role may read/write/query/transact but
    // may NOT call DescribeTable, CreateTable, DeleteTable, UpdateTable,
    // or any other data-plane operations (UpdateTimeToLive is an admin op).
    //
    // Required actions (PLAN §8 / NFR-03.3):
    //   dynamodb:GetItem
    //   dynamodb:PutItem
    //   dynamodb:UpdateItem
    //   dynamodb:Query
    //   dynamodb:BatchGetItem
    //   dynamodb:TransactWriteItems

    if (props.vercelRoleArn) {
      const vercelRole = iam.Role.fromRoleArn(
        this,
        "VercelOidcRole",
        props.vercelRoleArn,
        { mutable: false }
      );

      this.table.grant(
        vercelRole,
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:BatchGetItem",
        "dynamodb:TransactWriteItems",
        "dynamodb:ConditionCheckItem"
      );
    }

    // ── Outputs ──────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, "TableName", {
      value: this.table.tableName,
      description: "Set PULSE_TABLE_NAME to this value in Vercel env vars",
    });

    new cdk.CfnOutput(this, "TableArn", {
      value: this.table.tableArn,
      description: "ARN of the Pulse DynamoDB table",
    });

    new cdk.CfnOutput(this, "StreamArn", {
      value: this.table.tableStreamArn ?? "N/A",
      description: "DynamoDB Streams ARN (reserved for future Lambda fan-out)",
    });
  }
}
