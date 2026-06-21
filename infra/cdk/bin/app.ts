#!/usr/bin/env node
/**
 * infra/cdk/bin/app.ts
 *
 * CDK app entry point for the Pulse infrastructure.
 *
 * Usage:
 *   cd infra && cdk synth
 *   cd infra && cdk deploy --require-approval broadening
 *
 * Environment variables:
 *   AWS_ACCOUNT      — target AWS account ID (defaults to CDK_DEFAULT_ACCOUNT)
 *   AWS_REGION       — target region (defaults to CDK_DEFAULT_REGION / us-east-1)
 *   PULSE_TABLE_NAME — override the DynamoDB table name (default: "Pulse")
 *   VERCEL_ROLE_ARN  — Vercel OIDC role ARN to grant table access (optional)
 */

import * as cdk from "aws-cdk-lib";
import { PulseStack } from "../pulse-stack";

const app = new cdk.App();

const account = process.env.AWS_ACCOUNT ?? process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.AWS_REGION ?? process.env.CDK_DEFAULT_REGION ?? "us-east-1";

new PulseStack(app, "PulseStack", {
  env: { account, region },
  tableName: process.env.PULSE_TABLE_NAME ?? "Pulse",
  vercelRoleArn: process.env.VERCEL_ROLE_ARN,
  description: "Pulse — real-time audience engagement app (DynamoDB single-table)",
  tags: {
    Project: "Pulse",
    ManagedBy: "CDK",
  },
});
