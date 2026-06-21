/**
 * scripts/deploy.ts
 *
 * Confirmation-gated CDK deploy script (SC10).
 *
 * Features:
 *   --dry-run   → synthesises the CDK template without deploying.
 *   --force     → skips the interactive Y/N prompt (for CI pipelines).
 *   --stack     → override the stack name (default: PulseStack).
 *
 * Usage:
 *   tsx scripts/deploy.ts                   # interactive prompt
 *   tsx scripts/deploy.ts --dry-run         # synth only
 *   tsx scripts/deploy.ts --force           # non-interactive deploy
 *
 * Pre-requisites:
 *   1. AWS credentials in the environment (AWS_ACCESS_KEY_ID, or role assumed).
 *   2. CDK bootstrapped: `cd infra && cdk bootstrap`.
 *   3. Table name set: PULSE_TABLE_NAME env var.
 *   4. Optional: VERCEL_ROLE_ARN set to grant the Vercel OIDC role access.
 *
 * This script does NOT push to production automatically and does NOT
 * accept any real secrets as arguments. Secrets must be set via env vars
 * before invocation.
 */

import { execSync } from "node:child_process";
import * as readline from "node:readline";
import * as path from "node:path";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");
const STACK = (() => {
  const idx = args.indexOf("--stack");
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : "PulseStack";
})();

const INFRA_DIR = path.resolve(
  import.meta.dirname ?? __dirname,
  "../infra"
);

function run(cmd: string): void {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { cwd: INFRA_DIR, stdio: "inherit" });
}

/** Run a command and capture stdout; returns null on any failure (non-fatal). */
function capture(cmd: string): string | null {
  try {
    const out = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Best-effort AWS account id (via STS) — null if creds/CLI unavailable. */
function awsAccount(): string | null {
  return capture("aws sts get-caller-identity --query Account --output text");
}

/** Resolve the deploy region: explicit env → AWS default → profile → us-east-1. */
function awsRegion(): string {
  return (
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    capture("aws configure get region") ||
    "us-east-1"
  );
}

/**
 * CDK requires a one-time `cdk bootstrap` per account+region. If the bootstrap
 * SSM parameter is absent, `cdk deploy` fails with a cryptic error — so detect
 * it up front and print the exact remedy instead.
 */
function assertBootstrapped(account: string | null, region: string): void {
  const version = capture(
    `aws ssm get-parameter --name /cdk-bootstrap/hnb659fds/version --region ${region} --query Parameter.Value --output text`
  );
  if (version) return;
  console.error(
    "\n✗ This AWS account/region is not CDK-bootstrapped (one-time setup required).\n"
  );
  console.error("  Run this once, then re-run `npm run deploy:infra`:\n");
  console.error(
    `    cd infra && npx cdk bootstrap aws://${account ?? "<account-id>"}/${region}\n`
  );
  console.error(
    "  (Bootstrap creates a small CDK staging stack: an S3 bucket + a few IAM roles.)\n"
  );
  process.exit(1);
}

function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

async function main(): Promise<void> {
  // Resolve account/region for the banner + bootstrap check (skip AWS calls on dry-run).
  const account = DRY_RUN ? null : awsAccount();
  const region = awsRegion();

  console.log("=============================================================");
  console.log(" Pulse CDK Deploy");
  console.log("=============================================================");
  console.log(`  Stack:    ${STACK}`);
  console.log(`  Infra:    ${INFRA_DIR}`);
  console.log(`  Table:    ${process.env.PULSE_TABLE_NAME ?? "(not set — will use 'Pulse')"}`);
  console.log(`  Account:  ${account ?? "(dry run / unknown)"}`);
  console.log(`  Region:   ${region}`);
  console.log(`  Dry run:  ${DRY_RUN}`);
  console.log("=============================================================\n");

  if (!process.env.PULSE_TABLE_NAME) {
    console.warn(
      "WARNING: PULSE_TABLE_NAME is not set — the stack will use the default 'Pulse'."
    );
  }

  if (DRY_RUN) {
    console.log("DRY RUN: synthesising CDK template only (no deployment).\n");
    run(`cdk synth ${STACK}`);
    console.log("\nDry run complete. Review the template above before deploying.");
    return;
  }

  // Fail fast with an actionable message if the account/region isn't bootstrapped.
  assertBootstrapped(account, region);

  if (!FORCE) {
    const ok = await confirm(`Deploy ${STACK} to AWS account ${account ?? "(unknown)"}?`);
    if (!ok) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  console.log("\nDeploying...");
  run(`cdk deploy ${STACK} --require-approval broadening --outputs-file cdk-outputs.json`);

  console.log("\nDeploy complete. Stack outputs written to infra/cdk-outputs.json.");
  console.log("Copy the TableName output to Vercel env vars as PULSE_TABLE_NAME.");
}

main().catch((err) => {
  console.error("Deploy failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
