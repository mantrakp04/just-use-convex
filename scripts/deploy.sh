#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────
# Unified deploy script for Vercel CI.
#
# Called in two modes:
#   1. Outer (no args)  — determines env, runs convex deploy
#   2. Inner (--inner)  — runs inside convex deploy --cmd:
#                         deploys alchemy, sets convex env vars, builds web
#
# Flow: convex deploy → alchemy deploy → convex env set → web build
# ─────────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "--inner" ]]; then
  # ─── INNER: runs after convex deploy sets VITE_CONVEX_URL ────────
  echo "→ VITE_CONVEX_URL=$VITE_CONVEX_URL"

  # Derive Convex URLs
  export VITE_CONVEX_SITE_URL="${VITE_CONVEX_URL/.convex.cloud/.convex.site}"
  export CONVEX_URL="$VITE_CONVEX_URL"
  export CONVEX_SITE_URL="$VITE_CONVEX_SITE_URL"

  echo "→ CONVEX_SITE_URL=$CONVEX_SITE_URL"
  echo "→ SITE_URL=$SITE_URL"

  # ─── Deploy Cloudflare agent via Alchemy ─────────────────────────
  echo "→ Deploying Cloudflare agent..."
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(dirname "$SCRIPT_DIR")"

  cd "$REPO_ROOT/packages/agent"
  ALCHEMY_OUTPUT=$(bunx alchemy deploy alchemy.run.ts 2>&1 | tee /dev/stderr)

  # Extract worker URL from alchemy output
  WORKER_URL=$(echo "$ALCHEMY_OUTPUT" | grep -oP 'ALCHEMY_WORKER_URL=\K.*' | tail -1)

  if [[ -z "${WORKER_URL:-}" ]]; then
    echo "ERROR: Failed to capture worker URL from alchemy deploy"
    exit 1
  fi

  export VITE_AGENT_URL="$WORKER_URL"
  echo "→ VITE_AGENT_URL=$VITE_AGENT_URL"

  # ─── Set Convex env vars on the deployment ───────────────────────
  echo "→ Setting Convex environment variables..."
  cd "$REPO_ROOT/packages/backend"

  CONVEX_ENV_FLAGS=""
  if [[ "${IS_PREVIEW:-false}" == "true" ]]; then
    CONVEX_ENV_FLAGS="--preview-name ${VERCEL_GIT_COMMIT_REF}"
  fi

  # Override AGENT_URL with the freshly deployed worker URL
  export AGENT_URL="$VITE_AGENT_URL"

  # Push all vars from root .env to Convex deployment
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    # Resolve from current env (may have been overridden, e.g. AGENT_URL)
    resolved="${!key:-$value}"
    [[ -n "$resolved" ]] && bunx convex env set $CONVEX_ENV_FLAGS "$key" "$resolved" 2>/dev/null || echo "  ⚠ failed to set $key"
  done < "$REPO_ROOT/.env"

  # ─── Build web app ──────────────────────────────────────────────
  echo "→ Building web app..."
  cd "$REPO_ROOT/apps/web" && bun run build

  exit 0
fi

# ─── OUTER: entry point from Vercel ─────────────────────────────────

export IS_PREVIEW=false
if [[ "${VERCEL_ENV:-}" == "preview" ]]; then
  export IS_PREVIEW=true
fi

# Derive SITE_URL from Vercel env
if [[ "$IS_PREVIEW" == "true" ]]; then
  export SITE_URL="https://${VERCEL_BRANCH_URL:-$VERCEL_URL}"
  export ALCHEMY_STAGE="preview-${VERCEL_GIT_COMMIT_REF}"
else
  export SITE_URL="https://${VERCEL_PROJECT_PRODUCTION_URL}"
  export ALCHEMY_STAGE="prod"
fi

echo "→ Environment: ${VERCEL_ENV:-unknown}"
echo "→ SITE_URL=$SITE_URL"

# Deploy Convex, which triggers --inner for alchemy + web build
cd packages/backend

if [[ "$IS_PREVIEW" == "true" ]]; then
  echo "→ Deploying Convex preview: ${VERCEL_GIT_COMMIT_REF}"
  bunx convex deploy --preview "${VERCEL_GIT_COMMIT_REF}" \
    --cmd "bash ../../scripts/deploy.sh --inner" \
    --cmd-url-env-var-name VITE_CONVEX_URL
else
  echo "→ Deploying Convex production"
  bunx convex deploy \
    --cmd "bash ../../scripts/deploy.sh --inner" \
    --cmd-url-env-var-name VITE_CONVEX_URL
fi
