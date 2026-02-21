#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Qurvo Analytics — Build & Deploy
#
# Usage:
#   ./deploy.sh                    # build ALL, push, deploy
#   ./deploy.sh --only ingest      # build+push only ingest, deploy all
#   ./deploy.sh --only ingest,api  # build+push ingest and api, deploy all
#   ./deploy.sh --skip-build       # deploy only (images must exist in registry)
#   ./deploy.sh --tag v1.0         # use custom tag instead of git commit hash
# ==============================================================================

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
REGISTRY="ghcr.io/melodi-c/qurvo"
HELM_CHART="$REPO_ROOT/k8s/qurvo-analytics"
RELEASE_NAME="qurvo"
NAMESPACE="default"
KUBECONFIG_PATH="$HELM_CHART/config.yaml"

ALL_APPS=(api ingest processor web)
NESTJS_APPS=(api ingest processor)
PLATFORM="linux/amd64"
SKIP_BUILD=false
TAG=""
ONLY=""

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true; shift ;;
    --tag)        TAG="$2"; shift 2 ;;
    --only)       ONLY="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: ./deploy.sh [--skip-build] [--tag <tag>] [--only app1,app2]"
      echo ""
      echo "Options:"
      echo "  --only app1,app2  Build only specified apps (api,ingest,processor,web)"
      echo "  --skip-build      Deploy only, skip docker build+push"
      echo "  --tag <tag>       Custom image tag (default: git commit hash)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Resolve tag ──────────────────────────────────────────────────────────────
if [[ -z "$TAG" ]]; then
  TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
fi

# ── Resolve which apps to build ─────────────────────────────────────────────
BUILD_APPS=()
if [[ -n "$ONLY" ]]; then
  IFS=',' read -ra BUILD_APPS <<< "$ONLY"
  # Validate app names
  for app in "${BUILD_APPS[@]}"; do
    valid=false
    for known in "${ALL_APPS[@]}"; do
      [[ "$app" == "$known" ]] && valid=true
    done
    if [[ "$valid" == false ]]; then
      echo "ERROR: Unknown app '$app'. Valid: ${ALL_APPS[*]}"
      exit 1
    fi
  done
else
  BUILD_APPS=("${ALL_APPS[@]}")
fi

echo "==> Tag: $TAG"
echo "==> Registry: $REGISTRY"

# ── Build & push ─────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  echo ""
  echo "==> Building Docker images: ${BUILD_APPS[*]}"

  PIDS=()

  for app in "${BUILD_APPS[@]}"; do
    if [[ "$app" == "web" ]]; then
      TARGET="web"
      BUILD_ARG=""
    else
      TARGET="nestjs"
      BUILD_ARG="--build-arg APP=$app"
    fi

    echo "    [$app] Starting build..."
    docker build \
      --platform "$PLATFORM" \
      --progress=plain \
      --target "$TARGET" \
      $BUILD_ARG \
      -t "$REGISTRY/$app:$TAG" \
      "$REPO_ROOT" > /tmp/docker-build-$app.log 2>&1 &
    PIDS+=("$!:$app")
  done

  # Wait for builds with progress
  FAILED=false
  for entry in "${PIDS[@]}"; do
    pid="${entry%%:*}"
    app="${entry##*:}"
    if wait "$pid"; then
      echo "    [$app] Build complete ✓"
    else
      echo "    [$app] Build FAILED ✗ (see /tmp/docker-build-$app.log)"
      FAILED=true
    fi
  done

  if [[ "$FAILED" == true ]]; then
    echo "ERROR: Some builds failed. Aborting."
    exit 1
  fi

  echo "==> All images built."

  echo ""
  echo "==> Pushing images..."
  PIDS=()
  for app in "${BUILD_APPS[@]}"; do
    docker push "$REGISTRY/$app:$TAG" > /tmp/docker-push-$app.log 2>&1 &
    PIDS+=("$!:$app")
  done

  FAILED=false
  for entry in "${PIDS[@]}"; do
    pid="${entry%%:*}"
    app="${entry##*:}"
    if wait "$pid"; then
      echo "    [$app] Pushed ✓"
    else
      echo "    [$app] Push FAILED ✗ (see /tmp/docker-push-$app.log)"
      FAILED=true
    fi
  done

  if [[ "$FAILED" == true ]]; then
    echo "ERROR: Some pushes failed. Aborting."
    exit 1
  fi

  echo "==> All images pushed."
fi

# ── Deploy with Helm ─────────────────────────────────────────────────────────
echo ""
echo "==> Deploying to Kubernetes..."

KUBECONFIG="$KUBECONFIG_PATH" helm upgrade --install "$RELEASE_NAME" "$HELM_CHART" \
  --namespace "$NAMESPACE" \
  -f "$HELM_CHART/values.yaml" \
  -f "$HELM_CHART/values.production.yaml" \
  -f "$HELM_CHART/values.local-secrets.yaml" \
  --set global.imageTag="$TAG" \
  --wait \
  --timeout 5m

echo ""
echo "==> Deploy complete! Tag: $TAG"
echo "==> Checking rollout status..."

KUBECONFIG="$KUBECONFIG_PATH" kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME" --no-headers
