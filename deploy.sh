#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Qurvo Analytics — Build & Deploy
#
# Usage:
#   ./deploy.sh              # build, push, deploy with current commit hash
#   ./deploy.sh --skip-build # deploy only (images must exist in registry)
#   ./deploy.sh --tag v1.0   # use custom tag instead of git commit hash
# ==============================================================================

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
REGISTRY="ghcr.io/melodi-c/qurvo"
HELM_CHART="$REPO_ROOT/k8s/qurvo-analytics"
RELEASE_NAME="qurvo"
NAMESPACE="default"
KUBECONFIG_PATH="$HELM_CHART/config.yaml"

APPS=(api ingest processor)
PLATFORM="linux/amd64"
SKIP_BUILD=false
TAG=""

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true; shift ;;
    --tag)        TAG="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: ./deploy.sh [--skip-build] [--tag <tag>]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Resolve tag ──────────────────────────────────────────────────────────────
if [[ -z "$TAG" ]]; then
  TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
fi

echo "==> Tag: $TAG"
echo "==> Registry: $REGISTRY"

# ── Build & push ─────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  echo ""
  echo "==> Building Docker images..."

  # Build NestJS apps in parallel
  for app in "${APPS[@]}"; do
    echo "    Building $app..."
    docker build \
      --platform "$PLATFORM" \
      --target nestjs \
      --build-arg APP="$app" \
      -t "$REGISTRY/$app:$TAG" \
      "$REPO_ROOT" &
  done

  # Build web
  echo "    Building web..."
  docker build \
    --platform "$PLATFORM" \
    --target web \
    -t "$REGISTRY/web:$TAG" \
    "$REPO_ROOT" &

  # Wait for all builds
  wait
  echo "==> All images built."

  echo ""
  echo "==> Pushing images to registry..."
  for app in "${APPS[@]}" web; do
    docker push "$REGISTRY/$app:$TAG" &
  done
  wait
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
