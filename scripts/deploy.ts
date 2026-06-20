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
  console.log("=============================================================");
  console.log(" Pulse CDK Deploy");
  console.log("=============================================================");
  console.log(`  Stack:    ${STACK}`);
  console.log(`  Infra:    ${INFRA_DIR}`);
  console.log(`  Table:    ${process.env.PULSE_TABLE_NAME ?? "(not set — will use 'Pulse')"}`);
  console.log(`  Region:   ${process.env.AWS_REGION ?? "(not set)"}`);
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

  if (!FORCE) {
    const ok = await confirm(
      `Deploy ${STACK} to AWS account ${process.env.AWS_ACCOUNT ?? "(unknown)"}?`
    );
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
