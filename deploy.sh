#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Qurvo Analytics — Build & Deploy
#
# Usage:
#   ./deploy.sh                    # build ALL, push, deploy
#   ./deploy.sh --only ingest      # rebuild ingest only, deploy all
#   ./deploy.sh --only ingest,api  # rebuild ingest+api, deploy all
#   ./deploy.sh --skip-build       # deploy only (images must exist in registry)
#   ./deploy.sh --tag v1.0         # use custom tag instead of git commit hash
# ==============================================================================

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
REGISTRY="ghcr.io/melodi-c/qurvo"
HELM_CHART="$REPO_ROOT/k8s/qurvo-analytics"
RELEASE_NAME="qurvo"
NAMESPACE="default"
KUBECONFIG_PATH="$HELM_CHART/config.yaml"
export KUBECONFIG="$KUBECONFIG_PATH"

ALL_APPS=(api ingest processor web)
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
  if [[ "$SKIP_BUILD" == true ]]; then
    TAG=$(helm get values "$RELEASE_NAME" -n "$NAMESPACE" -o json 2>/dev/null | \
      python3 -c "import sys,json; print(json.load(sys.stdin).get('global',{}).get('imageTag',''))" 2>/dev/null || echo "")
    if [[ -z "$TAG" ]]; then
      echo "ERROR: --skip-build requires a deployed release or --tag <tag>"
      exit 1
    fi
  else
    TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  fi
fi

# ── Resolve which apps to build ─────────────────────────────────────────────
BUILD_APPS=()
if [[ -n "$ONLY" ]]; then
  IFS=',' read -ra BUILD_APPS <<< "$ONLY"
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
  echo "==> Building: ${BUILD_APPS[*]}"

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

  FAILED=false
  for entry in "${PIDS[@]}"; do
    pid="${entry%%:*}"
    app="${entry##*:}"
    if wait "$pid"; then
      echo "    [$app] Built ✓"
    else
      echo "    [$app] FAILED ✗  (see /tmp/docker-build-$app.log)"
      FAILED=true
    fi
  done
  [[ "$FAILED" == true ]] && { echo "ERROR: Build failed. Aborting."; exit 1; }

  echo ""
  echo "==> Pushing..."
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
      echo "    [$app] FAILED ✗  (see /tmp/docker-push-$app.log)"
      FAILED=true
    fi
  done
  [[ "$FAILED" == true ]] && { echo "ERROR: Push failed. Aborting."; exit 1; }
fi

# ── Deploy with Helm ─────────────────────────────────────────────────────────
echo ""
echo "==> Deploying to Kubernetes..."

# Build helm --set flags for per-service image tags
HELM_SET_ARGS=(--set "global.imageTag=$TAG")

# When --only is used, keep the current deployed tag for non-rebuilt apps
if [[ -n "$ONLY" ]]; then
  CURRENT_TAG=$(helm get values "$RELEASE_NAME" -n "$NAMESPACE" -o json 2>/dev/null | \
    python3 -c "import sys,json; v=json.load(sys.stdin); print(v.get('global',{}).get('imageTag',''))" 2>/dev/null || echo "")

  if [[ -z "$CURRENT_TAG" ]]; then
    echo "ERROR: Cannot determine current deployed tag. Use full deploy without --only."
    exit 1
  fi

  echo "    Current deployed tag: $CURRENT_TAG"
  echo "    New tag for ${BUILD_APPS[*]}: $TAG"

  for app in "${ALL_APPS[@]}"; do
    is_built=false
    for b in "${BUILD_APPS[@]}"; do
      [[ "$app" == "$b" ]] && is_built=true
    done
    if [[ "$is_built" == true ]]; then
      HELM_SET_ARGS+=(--set "${app}.image.tag=$TAG")
    else
      HELM_SET_ARGS+=(--set "${app}.image.tag=$CURRENT_TAG")
    fi
  done
  # global tag = current (for migrations etc that use api image)
  HELM_SET_ARGS[0]="--set"
  HELM_SET_ARGS[1]="global.imageTag=$CURRENT_TAG"
fi

helm upgrade --install "$RELEASE_NAME" "$HELM_CHART" \
  --namespace "$NAMESPACE" \
  -f "$HELM_CHART/values.yaml" \
  -f "$HELM_CHART/values.production.yaml" \
  -f "$HELM_CHART/values.local-secrets.yaml" \
  "${HELM_SET_ARGS[@]}" \
  --wait \
  --timeout 5m

echo ""
echo "==> Deploy complete! Tag: $TAG"
kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME" --no-headers
