#!/usr/bin/env bash
# =============================================================================
# scripts/init-aws.sh
#
# Pulse — Vercel ↔ AWS OIDC trust bootstrap (SC10, gated, idempotent).
#
# What this script does (OIDC wiring only — no DynamoDB provisioned here):
#   1. Creates (or verifies) the Vercel OIDC Identity Provider in IAM.
#   2. Creates (or verifies) the PulseVercelRole IAM role with an
#      AssumeRoleWithWebIdentity trust policy scoped to your Vercel team/project.
#   3. Attaches a least-privilege inline policy: only the data-plane DynamoDB
#      actions needed by the app, scoped to the Pulse table ARN.
#   4. Prints the resulting AWS_ROLE_ARN for you to paste into Vercel.
#
# GATING:
#   - Prints every AWS CLI command before running it.
#   - Requires explicit "yes" confirmation before any AWS write.
#   - Supports DRY_RUN=true (print-only, no AWS calls):
#       DRY_RUN=true bash scripts/init-aws.sh
#
# IDEMPOTENCY:
#   - Uses `--no-fail-on-exist` / conditional checks so re-runs are safe.
#
# PREREQUISITES:
#   - AWS CLI v2 installed and configured (`aws sts get-caller-identity` works).
#   - You know your Vercel Team ID (Settings → General → Team ID in Vercel dashboard).
#   - You know your Vercel Project ID (Project → Settings → General in Vercel dashboard).
#   - The DynamoDB table does NOT need to exist yet (table is provisioned by deploy-infra.sh).
#
# USAGE:
#   bash scripts/init-aws.sh                  # interactive
#   DRY_RUN=true bash scripts/init-aws.sh     # print-only, no AWS calls
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
cmd()     { echo -e "${BOLD}\$ $*${RESET}"; }

DRY_RUN="${DRY_RUN:-false}"

run_aws() {
  cmd "aws $*"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "  [DRY RUN — skipped]"
    return 0
  fi
  aws "$@"
}

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================="
echo "  Pulse — Vercel ↔ AWS OIDC Bootstrap"
echo "  (SC10: gated, idempotent, no data-resource provisioning)"
echo "============================================================="
if [[ "$DRY_RUN" == "true" ]]; then
  warn "DRY RUN mode — no AWS calls will be made."
fi
echo ""

# ── Pre-flight: verify AWS CLI is configured ──────────────────────────────────
if ! command -v aws &>/dev/null && [[ "$DRY_RUN" != "true" ]]; then
  fatal "AWS CLI not found. Install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html"
fi

if [[ "$DRY_RUN" != "true" ]]; then
  info "Verifying AWS CLI credentials..."
  if ! CALLER_IDENTITY=$(aws sts get-caller-identity --output json 2>&1); then
    fatal "AWS CLI not authenticated. Run 'aws configure' or set AWS_PROFILE/AWS_ACCESS_KEY_ID."
  fi
  AWS_ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | python3 -c "import sys,json; print(json.load(sys.stdin)['Account'])" 2>/dev/null \
    || echo "$CALLER_IDENTITY" | grep '"Account"' | sed 's/.*"Account": *"\([^"]*\)".*/\1/')
  success "Authenticated as account ${AWS_ACCOUNT_ID}"
else
  AWS_ACCOUNT_ID="${AWS_ACCOUNT:-123456789012}"
  warn "DRY RUN: using placeholder account ID ${AWS_ACCOUNT_ID}"
fi

# ── Collect inputs ────────────────────────────────────────────────────────────
echo ""
info "Collecting configuration inputs."
info "All values can also be pre-set as environment variables to skip prompts."
echo ""

# AWS region
if [[ -z "${AWS_REGION:-}" ]]; then
  read -r -p "AWS region [us-east-1]: " AWS_REGION
  AWS_REGION="${AWS_REGION:-us-east-1}"
fi
info "Region: ${AWS_REGION}"

# Vercel Team ID
if [[ -z "${VERCEL_TEAM_ID:-}" ]]; then
  echo ""
  echo "  Your Vercel Team ID is found at:"
  echo "  Vercel Dashboard -> Settings -> General -> Team ID"
  echo "  It looks like: team_xxxxxxxxxxxxxxxxxxxxxxxx"
  read -r -p "Vercel Team ID: " VERCEL_TEAM_ID
fi
[[ -z "$VERCEL_TEAM_ID" ]] && fatal "VERCEL_TEAM_ID is required."
info "Vercel Team ID: ${VERCEL_TEAM_ID}"

# Vercel Project ID
if [[ -z "${VERCEL_PROJECT_ID:-}" ]]; then
  echo ""
  echo "  Your Vercel Project ID is found at:"
  echo "  Vercel Dashboard -> [Project] -> Settings -> General -> Project ID"
  echo "  It looks like: prj_xxxxxxxxxxxxxxxxxxxxxxxx"
  read -r -p "Vercel Project ID: " VERCEL_PROJECT_ID
fi
[[ -z "$VERCEL_PROJECT_ID" ]] && fatal "VERCEL_PROJECT_ID is required."
info "Vercel Project ID: ${VERCEL_PROJECT_ID}"

# Table name
if [[ -z "${PULSE_TABLE_NAME:-}" ]]; then
  read -r -p "DynamoDB table name [Pulse]: " PULSE_TABLE_NAME
  PULSE_TABLE_NAME="${PULSE_TABLE_NAME:-Pulse}"
fi
info "Table name: ${PULSE_TABLE_NAME}"

# Derived values
OIDC_PROVIDER_URL="https://oidc.vercel.com/${VERCEL_TEAM_ID}"
OIDC_AUDIENCE="https://aws.amazon.com/oidc"
ROLE_NAME="PulseVercelRole"
TABLE_ARN="arn:aws:dynamodb:${AWS_REGION}:${AWS_ACCOUNT_ID}:table/${PULSE_TABLE_NAME}"
TABLE_INDEX_ARN="${TABLE_ARN}/index/*"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "============================================================="
echo "  Configuration summary"
echo "============================================================="
echo "  AWS account:      ${AWS_ACCOUNT_ID}"
echo "  AWS region:       ${AWS_REGION}"
echo "  OIDC provider:    ${OIDC_PROVIDER_URL}"
echo "  OIDC audience:    ${OIDC_AUDIENCE}"
echo "  IAM role name:    ${ROLE_NAME}"
echo "  Table ARN:        ${TABLE_ARN}"
echo "  Index ARN:        ${TABLE_INDEX_ARN}"
echo "  Vercel Team ID:   ${VERCEL_TEAM_ID}"
echo "  Vercel Project:   ${VERCEL_PROJECT_ID}"
echo "============================================================="
echo ""

# ── Confirmation gate ─────────────────────────────────────────────────────────
if [[ "$DRY_RUN" != "true" ]]; then
  read -r -p "Proceed? This will create/verify IAM resources in account ${AWS_ACCOUNT_ID}. Type 'yes' to continue: " CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    echo "Aborted. No AWS resources were created."
    exit 0
  fi
fi

echo ""

# ── Step 1: OIDC Identity Provider ───────────────────────────────────────────
info "Step 1/3 — Vercel OIDC Identity Provider"

# Get thumbprint for the Vercel OIDC issuer
# This thumbprint is for the Vercel OIDC endpoint certificate chain root CA.
# IAM OIDC providers require a thumbprint; for Vercel this is their well-known TLS cert.
# The value below is the thumbprint of the root CA for oidc.vercel.com (DigiCert).
# Re-derive with: openssl s_client -connect oidc.vercel.com:443 -showcerts 2>/dev/null | ...
THUMBPRINT="9e99a48a9960b14926bb7f3b02e22da2b0ab7280"

# Build trust-policy JSON
TRUST_POLICY=$(cat <<TRUST_JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/oidc.vercel.com/${VERCEL_TEAM_ID}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.vercel.com/${VERCEL_TEAM_ID}:aud": "${OIDC_AUDIENCE}",
          "oidc.vercel.com/${VERCEL_TEAM_ID}:sub": "owner:${VERCEL_TEAM_ID}:project:${VERCEL_PROJECT_ID}:environment:production"
        }
      }
    }
  ]
}
TRUST_JSON
)

# Check if OIDC provider already exists
PROVIDER_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/oidc.vercel.com/${VERCEL_TEAM_ID}"

if [[ "$DRY_RUN" != "true" ]]; then
  if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" &>/dev/null; then
    success "OIDC provider already exists: ${PROVIDER_ARN}"
  else
    info "Creating OIDC identity provider for Vercel..."
    cmd "aws iam create-open-id-connect-provider \\"
    cmd "  --url '${OIDC_PROVIDER_URL}' \\"
    cmd "  --client-id-list '${OIDC_AUDIENCE}' \\"
    cmd "  --thumbprint-list '${THUMBPRINT}'"
    aws iam create-open-id-connect-provider \
      --url "$OIDC_PROVIDER_URL" \
      --client-id-list "$OIDC_AUDIENCE" \
      --thumbprint-list "$THUMBPRINT"
    success "OIDC identity provider created."
  fi
else
  cmd "aws iam get-open-id-connect-provider --open-id-connect-provider-arn '${PROVIDER_ARN}'"
  cmd "aws iam create-open-id-connect-provider --url '${OIDC_PROVIDER_URL}' --client-id-list '${OIDC_AUDIENCE}' --thumbprint-list '${THUMBPRINT}'"
  echo "  [DRY RUN — skipped]"
fi

# ── Step 2: IAM Role ──────────────────────────────────────────────────────────
echo ""
info "Step 2/3 — IAM Role: ${ROLE_NAME}"

if [[ "$DRY_RUN" != "true" ]]; then
  if EXISTING_ROLE=$(aws iam get-role --role-name "$ROLE_NAME" --output json 2>/dev/null); then
    success "Role ${ROLE_NAME} already exists — verifying trust policy..."
    ROLE_ARN=$(echo "$EXISTING_ROLE" | python3 -c "import sys,json; print(json.load(sys.stdin)['Role']['Arn'])" 2>/dev/null \
      || echo "$EXISTING_ROLE" | grep '"Arn"' | head -1 | sed 's/.*"Arn": *"\([^"]*\)".*/\1/')
    info "Updating trust policy on existing role..."
    cmd "aws iam update-assume-role-policy --role-name '${ROLE_NAME}' --policy-document '<trust-policy-json>'"
    aws iam update-assume-role-policy \
      --role-name "$ROLE_NAME" \
      --policy-document "$TRUST_POLICY"
    success "Trust policy updated."
  else
    info "Creating IAM role ${ROLE_NAME}..."
    cmd "aws iam create-role --role-name '${ROLE_NAME}' --assume-role-policy-document '<trust-policy-json>'"
    CREATE_OUTPUT=$(aws iam create-role \
      --role-name "$ROLE_NAME" \
      --assume-role-policy-document "$TRUST_POLICY" \
      --description "Vercel OIDC role for Pulse DynamoDB access" \
      --output json)
    ROLE_ARN=$(echo "$CREATE_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['Role']['Arn'])" 2>/dev/null \
      || echo "$CREATE_OUTPUT" | grep '"Arn"' | head -1 | sed 's/.*"Arn": *"\([^"]*\)".*/\1/')
    success "Role created: ${ROLE_ARN}"
  fi
else
  ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE_NAME}"
  cmd "aws iam create-role --role-name '${ROLE_NAME}' --assume-role-policy-document '<trust-policy-json>'"
  echo "  [DRY RUN — skipped]"
fi

# ── Step 3: Inline least-privilege policy ─────────────────────────────────────
echo ""
info "Step 3/3 — Attaching least-privilege DynamoDB policy"

DATA_POLICY=$(cat <<POLICY_JSON
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PulseDynamoDBDataPlane",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:BatchGetItem",
        "dynamodb:TransactWriteItems",
        "dynamodb:ConditionCheckItem"
      ],
      "Resource": [
        "${TABLE_ARN}",
        "${TABLE_INDEX_ARN}"
      ]
    }
  ]
}
POLICY_JSON
)

if [[ "$DRY_RUN" != "true" ]]; then
  cmd "aws iam put-role-policy --role-name '${ROLE_NAME}' --policy-name 'PulseDynamoDBDataPlane' --policy-document '<policy-json>'"
  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "PulseDynamoDBDataPlane" \
    --policy-document "$DATA_POLICY"
  success "Inline policy attached."
else
  cmd "aws iam put-role-policy --role-name '${ROLE_NAME}' --policy-name 'PulseDynamoDBDataPlane' --policy-document '<policy-json>'"
  echo "  [DRY RUN — skipped]"
  ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE_NAME}"
fi

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================="
echo "  Vercel OIDC bootstrap complete."
echo "============================================================="
echo ""
echo "  AWS_ROLE_ARN that must be set in Vercel environment variables:"
echo ""
echo -e "  ${BOLD}${GREEN}${ROLE_ARN}${RESET}"
echo ""
echo "  Next steps:"
echo "  1. Copy the ARN above."
echo "  2. In the Vercel dashboard, go to your project -> Settings -> Environment Variables."
echo "  3. Add the following variables for the Production environment:"
echo ""
echo "     PULSE_DB_MODE        = aws"
echo "     PULSE_TABLE_NAME     = ${PULSE_TABLE_NAME}"
echo "     AWS_REGION           = ${AWS_REGION}"
echo "     AWS_ROLE_ARN         = ${ROLE_ARN}"
echo "     PULSE_SESSION_SECRET = <output of: openssl rand -base64 32>"
echo ""
echo "  4. Run 'npm run deploy:infra' to provision the DynamoDB table."
echo "  5. Deploy the Vercel project ('vercel --prod' or push to main)."
echo ""
if [[ "$DRY_RUN" == "true" ]]; then
  warn "DRY RUN complete — no AWS resources were created."
fi
