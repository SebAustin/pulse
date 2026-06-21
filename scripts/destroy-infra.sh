#!/usr/bin/env bash
# =============================================================================
# scripts/destroy-infra.sh
#
# Pulse — tear down ALL AWS resources created by the gated deploy (gated, idempotent).
#
# Removes, each behind its own explicit "yes" confirmation:
#   1. The CloudFormation stack `PulseStack`        (npx cdk destroy)
#   2. The DynamoDB table (it has RemovalPolicy.RETAIN, so cdk destroy does NOT
#      delete it — this step deletes it explicitly; IRREVERSIBLE, wipes all data)
#   3. The IAM role `PulseVercelRole` (+ inline policy) and the Vercel OIDC
#      identity provider created by init-aws.sh
#
# GATING / SAFETY:
#   - Prints every command before running it.
#   - Requires an explicit "yes" before EACH destructive step (steps are independent).
#   - DRY_RUN=true  → print-only, makes no AWS calls.
#   - FORCE=true    → skip the per-step prompts (for non-interactive use). Use with care.
#   - Idempotent: missing resources are warned and skipped, not fatal.
#
# COST NOTE: DynamoDB PAY_PER_REQUEST has no idle charge, and the IAM role / OIDC
# provider are free. Leaving them costs nothing — this script is for clean removal.
#
# USAGE:
#   bash scripts/destroy-infra.sh                 # interactive, confirms each step
#   DRY_RUN=true bash scripts/destroy-infra.sh    # preview only, no AWS calls
#   FORCE=true   bash scripts/destroy-infra.sh    # no prompts (dangerous)
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
success() { echo -e "${GREEN}[ok]${RESET}    $*"; }
fatal()   { echo -e "${RED}[fatal]${RESET} $*" >&2; exit 1; }
cmd()     { echo -e "${BOLD}\$ $*${RESET}"; }

DRY_RUN="${DRY_RUN:-false}"
FORCE="${FORCE:-false}"

run_aws() {
  cmd "aws $*"
  if [[ "$DRY_RUN" == "true" ]]; then echo "  [DRY RUN — skipped]"; return 0; fi
  aws "$@"
}

# Returns 0 to proceed, 1 to skip the step.
confirm() {
  local prompt="$1"
  if [[ "$DRY_RUN" == "true" ]]; then info "DRY RUN — would prompt: ${prompt}"; return 0; fi
  if [[ "$FORCE" == "true" ]]; then warn "FORCE — skipping confirmation for: ${prompt}"; return 0; fi
  local reply
  read -r -p "$(echo -e "${YELLOW}${prompt} Type 'yes' to proceed: ${RESET}")" reply
  [[ "$reply" == "yes" ]]
}

echo ""
echo "============================================================="
echo "  Pulse — AWS teardown (destroy everything provisioned)"
echo "============================================================="
[[ "$DRY_RUN" == "true" ]] && warn "DRY RUN mode — no AWS calls will be made."
[[ "$FORCE" == "true" ]]   && warn "FORCE mode — per-step confirmations are skipped."
echo ""

# ── Pre-flight ────────────────────────────────────────────────────────────────
if [[ "$DRY_RUN" != "true" ]]; then
  command -v aws &>/dev/null || fatal "AWS CLI not found. Install AWS CLI v2."
  info "Verifying AWS credentials..."
  CALLER=$(aws sts get-caller-identity --output json 2>&1) || fatal "AWS CLI not authenticated. Run 'aws configure'."
  AWS_ACCOUNT_ID=$(echo "$CALLER" | python3 -c "import sys,json;print(json.load(sys.stdin)['Account'])" 2>/dev/null \
    || echo "$CALLER" | sed 's/.*"Account": *"\([^"]*\)".*/\1/')
  success "Authenticated as account ${AWS_ACCOUNT_ID}"
else
  AWS_ACCOUNT_ID="${AWS_ACCOUNT:-123456789012}"
fi

# ── Inputs ────────────────────────────────────────────────────────────────────
if [[ -z "${AWS_REGION:-}" ]]; then read -r -p "AWS region [us-east-1]: " AWS_REGION; AWS_REGION="${AWS_REGION:-us-east-1}"; fi
if [[ -z "${PULSE_TABLE_NAME:-}" ]]; then read -r -p "DynamoDB table name [Pulse]: " PULSE_TABLE_NAME; PULSE_TABLE_NAME="${PULSE_TABLE_NAME:-Pulse}"; fi
if [[ -z "${VERCEL_TEAM_ID:-}" ]]; then read -r -p "Vercel Team ID (for the OIDC provider; blank to skip OIDC removal): " VERCEL_TEAM_ID || true; fi

ROLE_NAME="${ROLE_NAME:-PulseVercelRole}"
POLICY_NAME="PulseDynamoDBDataPlane"
info "Region=${AWS_REGION}  Table=${PULSE_TABLE_NAME}  Role=${ROLE_NAME}"
echo ""

# ── Step 1: CloudFormation stack (cdk destroy) ───────────────────────────────
info "Step 1/3 — Destroy CloudFormation stack 'PulseStack'."
warn "Note: the DynamoDB table has RemovalPolicy.RETAIN, so this does NOT delete the table (step 2 does)."
if confirm "Destroy the PulseStack CloudFormation stack?"; then
  cmd "(cd infra && npx cdk destroy PulseStack --force)"
  if [[ "$DRY_RUN" != "true" ]]; then
    ( cd infra && npx cdk destroy PulseStack --force ) || warn "cdk destroy reported an issue (stack may not exist) — continuing."
  fi
  success "Stack teardown step complete."
else
  warn "Skipped stack destroy."
fi
echo ""

# ── Step 2: DynamoDB table (retained by cdk) ─────────────────────────────────
info "Step 2/3 — Delete the DynamoDB table '${PULSE_TABLE_NAME}' (IRREVERSIBLE — wipes all data)."
if confirm "PERMANENTLY delete DynamoDB table '${PULSE_TABLE_NAME}' and ALL its data?"; then
  if [[ "$DRY_RUN" == "true" ]] || aws dynamodb describe-table --table-name "$PULSE_TABLE_NAME" --region "$AWS_REGION" &>/dev/null; then
    run_aws dynamodb delete-table --table-name "$PULSE_TABLE_NAME" --region "$AWS_REGION" >/dev/null || warn "delete-table failed — check manually."
    success "Table deletion requested."
  else
    warn "Table '${PULSE_TABLE_NAME}' not found — already gone."
  fi
else
  warn "Skipped table deletion."
fi
echo ""

# ── Step 3: IAM role, inline policy, OIDC provider ───────────────────────────
info "Step 3/3 — Delete IAM role '${ROLE_NAME}' (+ inline policy) and the Vercel OIDC provider."
if confirm "Delete IAM role '${ROLE_NAME}', its inline policy, and the Vercel OIDC provider?"; then
  # inline policy first (a role with inline policies cannot be deleted)
  if [[ "$DRY_RUN" == "true" ]] || aws iam get-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME" &>/dev/null; then
    run_aws iam delete-role-policy --role-name "$ROLE_NAME" --policy-name "$POLICY_NAME" || warn "delete-role-policy failed."
  else
    warn "Inline policy ${POLICY_NAME} not found — skipping."
  fi
  if [[ "$DRY_RUN" == "true" ]] || aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
    run_aws iam delete-role --role-name "$ROLE_NAME" || warn "delete-role failed (detach any extra policies first)."
  else
    warn "Role ${ROLE_NAME} not found — skipping."
  fi
  if [[ -n "${VERCEL_TEAM_ID:-}" ]]; then
    PROVIDER_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/oidc.vercel.com/${VERCEL_TEAM_ID}"
    if [[ "$DRY_RUN" == "true" ]] || aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" &>/dev/null; then
      run_aws iam delete-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" || warn "delete OIDC provider failed."
    else
      warn "OIDC provider not found — skipping."
    fi
  else
    warn "No Vercel Team ID given — skipping OIDC provider removal (delete it manually if desired)."
  fi
  success "IAM teardown step complete."
else
  warn "Skipped IAM teardown."
fi

echo ""
success "Teardown finished. Verify in the AWS console (CloudFormation, DynamoDB, IAM)."
info "Don't forget the Vercel side: delete the Vercel project / Marketplace AWS integration if no longer needed."
