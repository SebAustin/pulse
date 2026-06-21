#!/usr/bin/env bash
# =============================================================================
# scripts/deploy-infra.sh
#
# Pulse — DynamoDB infrastructure deploy (SC10, gated).
#
# What this script does:
#   1. Always runs `cdk synth` (safe, offline, no AWS calls) and prints the
#      CloudFormation template diff summary so you can review before committing.
#   2. Requires an explicit "yes" before calling `cdk deploy`.
#   3. Delegates the actual gated deploy to scripts/deploy.ts for a single
#      coherent deploy path — this wrapper is the bash entry point that
#      package.json's `deploy:infra` script calls.
#
# GATING:
#   - cdk synth always runs (read-only, offline-capable).
#   - cdk deploy is blocked until the user types "yes".
#   - Abort before any AWS write if the user declines.
#
# MODES:
#   DRY_RUN=true bash scripts/deploy-infra.sh   — synth only, no deploy prompt
#   FORCE=true   bash scripts/deploy-infra.sh   — skip prompt (CI pipelines only)
#
# PREREQUISITES:
#   - AWS CLI configured with permissions to CloudFormation, DynamoDB, IAM.
#   - CDK bootstrapped in the target account/region:
#       cd infra && npx cdk bootstrap aws://<account>/<region>
#   - VERCEL_ROLE_ARN set if you want the IAM grant applied by the stack
#     (run scripts/init-aws.sh first to obtain the role ARN).
#
# USAGE:
#   npm run deploy:infra                         # normal interactive deploy
#   DRY_RUN=true npm run deploy:infra            # synth-only validation
#
# =============================================================================

set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }
fatal()   { echo -e "${RED}[fatal]${RESET} $*" >&2; exit 1; }

DRY_RUN="${DRY_RUN:-false}"
FORCE="${FORCE:-false}"

# Resolve project root (one level up from this script's directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
INFRA_DIR="${PROJECT_ROOT}/infra"

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================="
echo "  Pulse — DynamoDB Infrastructure Deploy"
echo "  (SC10: gated — synth always safe, deploy requires 'yes')"
echo "============================================================="
echo "  Stack:    PulseStack"
echo "  Infra:    ${INFRA_DIR}"
echo "  Table:    ${PULSE_TABLE_NAME:-Pulse (default)}"
echo "  Region:   ${AWS_REGION:-(not set — CDK will use default)}"
echo "  Role ARN: ${VERCEL_ROLE_ARN:-(not set — no IAM grant applied)}"
echo "  Dry run:  ${DRY_RUN}"
echo "============================================================="
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  warn "DRY RUN mode — cdk synth only, no deployment."
fi

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if ! command -v aws &>/dev/null && [[ "$DRY_RUN" != "true" ]]; then
  fatal "AWS CLI not found. Install from https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
fi

if [[ -z "${PULSE_TABLE_NAME:-}" ]]; then
  warn "PULSE_TABLE_NAME not set — the stack will use the default table name 'Pulse'."
fi

if [[ -z "${VERCEL_ROLE_ARN:-}" ]]; then
  warn "VERCEL_ROLE_ARN not set — the IAM grant to the Vercel OIDC role will NOT be applied."
  warn "Run 'npm run deploy:init-aws' first to obtain and set VERCEL_ROLE_ARN."
fi

# ── Step 1: CDK Synth (always safe, always runs) ──────────────────────────────
info "Step 1/2 — Synthesising CloudFormation template (offline, no AWS calls)..."
echo ""
echo "  $ cd infra && npx cdk synth PulseStack"
echo ""

if ! (cd "$INFRA_DIR" && npx cdk synth PulseStack 2>&1); then
  fatal "cdk synth failed. Fix the CDK code before deploying."
fi

echo ""
success "Synthesis succeeded. Review the template above."
echo ""

# ── Exit here in dry-run mode ─────────────────────────────────────────────────
if [[ "$DRY_RUN" == "true" ]]; then
  echo "============================================================="
  echo "  DRY RUN complete — no AWS resources were created."
  echo "  To deploy, re-run without DRY_RUN=true."
  echo "============================================================="
  exit 0
fi

# ── Step 2: Deploy gate ───────────────────────────────────────────────────────
info "Step 2/2 — Deploy gate"
echo ""

if [[ "$FORCE" != "true" ]]; then
  AWS_ACCOUNT_DISPLAY="${AWS_ACCOUNT:-$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo '(unknown)')}"
  echo "  This will create or update AWS resources in account ${AWS_ACCOUNT_DISPLAY},"
  echo "  region ${AWS_REGION:-default}."
  echo ""
  echo "  Resources that will be created (if they do not already exist):"
  echo "    - DynamoDB table '${PULSE_TABLE_NAME:-Pulse}' (PAY_PER_REQUEST, Streams, PITR)"
  echo "    - GSI1 (code lookup) and GSI2 (leaderboard)"
  echo "    - TTL on 'ttl' attribute"
  if [[ -n "${VERCEL_ROLE_ARN:-}" ]]; then
    echo "    - IAM inline policy grant to ${VERCEL_ROLE_ARN}"
  fi
  echo ""
  echo "  RemovalPolicy is RETAIN — the table will NOT be deleted if the stack is"
  echo "  removed. You must delete it manually to avoid DynamoDB charges."
  echo ""
  read -r -p "Deploy PulseStack to AWS? Type 'yes' to continue: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo ""
    echo "Aborted. No AWS resources were created."
    exit 0
  fi
fi

# ── Delegate to scripts/deploy.ts (single coherent deploy path) ───────────────
echo ""
info "Delegating to scripts/deploy.ts (--force bypasses second prompt in CI)..."
echo ""
echo "  $ npx tsx scripts/deploy.ts ${FORCE:+--force}"
echo ""

DEPLOY_ARGS=""
if [[ "$FORCE" == "true" ]]; then
  DEPLOY_ARGS="--force"
fi

(cd "$PROJECT_ROOT" && npx tsx scripts/deploy.ts $DEPLOY_ARGS)

echo ""
echo "============================================================="
echo "  Infrastructure deploy complete."
echo "============================================================="
echo ""
echo "  Next steps:"
echo "  1. Copy the TableName from the stack outputs above (it should be '${PULSE_TABLE_NAME:-Pulse}')."
echo "  2. Verify these Vercel environment variables are set (Production):"
echo "     PULSE_DB_MODE    = aws"
echo "     PULSE_TABLE_NAME = ${PULSE_TABLE_NAME:-Pulse}"
echo "     AWS_REGION       = ${AWS_REGION:-us-east-1}"
echo "     AWS_ROLE_ARN     = ${VERCEL_ROLE_ARN:-(set this first via deploy:init-aws)}"
echo "     PULSE_SESSION_SECRET = (must be a strong secret — openssl rand -base64 32)"
echo "  3. Deploy the Vercel project: 'vercel --prod' or push to main."
echo ""
echo "  Rollback: 'cd infra && npx cdk destroy PulseStack'"
echo "  WARNING: The table has RemovalPolicy.RETAIN — destroy does NOT delete the"
echo "  DynamoDB table. Delete it manually via the AWS console or AWS CLI if needed."
echo ""
