#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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

sanitize_stage() {
  local raw="${1:-preview}"
  raw="${raw,,}"
  raw="${raw//\//-}"
  raw="${raw//[^a-z0-9-]/-}"
  raw="${raw:0:40}"
  raw="${raw%-}"
  raw="${raw#-}"
  if [[ -z "$raw" ]]; then
    raw="preview"
  fi
  printf '%s\n' "$raw"
}

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
  WORKER_URL=""
  if [[ -n "${CLOUDFLARE_API_TOKEN:-}" || -n "${CLOUDFLARE_API_KEY:-}" ]]; then
    echo "→ Deploying Cloudflare agent..."
    cd "$REPO_ROOT/packages/agent"
    # CI deploys run in ephemeral environments; allow this unless explicitly overridden.
    export ALCHEMY_CI_STATE_STORE_CHECK="${ALCHEMY_CI_STATE_STORE_CHECK:-false}"
    ALCHEMY_LOG_FILE="$(mktemp)"
    if ! bunx alchemy deploy alchemy.run.ts >"$ALCHEMY_LOG_FILE" 2>&1; then
      cat "$ALCHEMY_LOG_FILE" >&2 || true
      rm -f "$ALCHEMY_LOG_FILE"
      echo "ERROR: Alchemy deploy failed"
      exit 1
    fi
    ALCHEMY_OUTPUT="$(cat "$ALCHEMY_LOG_FILE")"
    cat "$ALCHEMY_LOG_FILE"
    rm -f "$ALCHEMY_LOG_FILE"
    WORKER_URL=$(printf '%s\n' "$ALCHEMY_OUTPUT" | sed -n 's/^ALCHEMY_WORKER_URL=//p' | tail -1)
    if [[ -z "${WORKER_URL:-}" ]]; then
      echo "ERROR: Failed to capture worker URL from alchemy deploy"
      exit 1
    fi
  else
    WORKER_URL="${VITE_AGENT_URL:-${AGENT_URL:-}}"
    if [[ -z "${WORKER_URL:-}" ]]; then
      echo "ERROR: Cloudflare credentials are missing and no fallback agent URL is set."
      echo "Set CLOUDFLARE_API_TOKEN (or CLOUDFLARE_API_KEY) or provide VITE_AGENT_URL."
      exit 1
    fi
    echo "→ Skipping Cloudflare deploy (no credentials), using existing worker URL"
  fi

  export VITE_AGENT_URL="$WORKER_URL"
  echo "→ VITE_AGENT_URL=$VITE_AGENT_URL"

  # ─── Set Convex env vars on the deployment ───────────────────────
  echo "→ Setting Convex environment variables..."
  cd "$REPO_ROOT/packages/backend"

  CONVEX_ENV_ARGS=()
  if [[ "${IS_PREVIEW:-false}" == "true" ]]; then
    CONVEX_ENV_ARGS+=(--preview-name "${VERCEL_GIT_COMMIT_REF}")
  fi

  if [[ "${IS_PREVIEW:-false}" == "true" && -z "${DAYTONA_API_KEY:-}" ]]; then
    bunx convex env remove "${CONVEX_ENV_ARGS[@]}" DAYTONA_API_KEY 2>/dev/null || true
  fi

  # Override AGENT_URL with the freshly deployed worker URL
  export AGENT_URL="$VITE_AGENT_URL"

  # Push selected vars from CI env to Convex deployment.
  # Do not depend on a checked-in .env file in Vercel builds.
  CONVEX_ENV_ALLOWLIST=(
    AGENT_URL
    BETTER_AUTH_SECRET
    COMPOSIO_API_KEY
    DAYTONA_API_KEY
    DAYTONA_API_URL
    DAYTONA_TARGET
    EXTERNAL_TOKEN
    EXA_API_KEY
    JWKS
    MAX_VOLUME_READY_RETRIES
    SANDBOX_INACTIVITY_TIMEOUT_MINUTES
    SANDBOX_SNAPSHOT
    SANDBOX_VOLUME_MOUNT_PATH
    SITE_URL
    VOLTAGENT_PUBLIC_KEY
    VOLTAGENT_SECRET_KEY
  )

  for key in "${CONVEX_ENV_ALLOWLIST[@]}"; do
    value="${!key:-}"
    if [[ -n "$value" ]]; then
      bunx convex env set "${CONVEX_ENV_ARGS[@]}" "$key" "$value" 2>/dev/null || echo "  ⚠ failed to set $key"
    fi
  done

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
  preview_name="${VERCEL_GIT_COMMIT_REF:-preview}"
  export SITE_URL="https://${VERCEL_BRANCH_URL:-$VERCEL_URL}"
  export ALCHEMY_STAGE="preview-$(sanitize_stage "$preview_name")"
else
  export SITE_URL="https://${VERCEL_PROJECT_PRODUCTION_URL}"
  export ALCHEMY_STAGE="prod"
fi

echo "→ Environment: ${VERCEL_ENV:-unknown}"
echo "→ SITE_URL=$SITE_URL"
echo "→ ALCHEMY_STAGE=$ALCHEMY_STAGE"

# Deploy Convex, which triggers --inner for alchemy + web build
cd "$REPO_ROOT/packages/backend"

if [[ "$IS_PREVIEW" == "true" ]]; then
  preview_name="${VERCEL_GIT_COMMIT_REF:-preview}"
  echo "→ Deploying Convex preview: ${preview_name}"
  bunx convex deploy --preview-create "${preview_name}" \
    --cmd "bash ../../scripts/deploy.sh --inner" \
    --cmd-url-env-var-name VITE_CONVEX_URL
else
  echo "→ Deploying Convex production"
  bunx convex deploy \
    --cmd "bash ../../scripts/deploy.sh --inner" \
    --cmd-url-env-var-name VITE_CONVEX_URL
fi
