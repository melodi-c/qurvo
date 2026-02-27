#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Qurvo Analytics — Build & Deploy
#
# Usage:
#   ./deploy.sh                    # build ALL, push, deploy
#   ./deploy.sh --only ingest      # rebuild ingest only, keep others as-is
#   ./deploy.sh --only ingest,api  # rebuild ingest+api, keep others
#   ./deploy.sh --skip-build       # re-deploy with current tags (no build)
#   ./deploy.sh --tag v1.0         # use custom tag instead of git commit hash
#   ./deploy.sh --no-hooks         # skip pre-install/pre-upgrade hooks (migrations)
#   ./deploy.sh --datadog          # also deploy/upgrade Datadog agent
# ==============================================================================

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
REGISTRY="qurvo.registry.twcstorage.ru"
HELM_CHART="$REPO_ROOT/k8s/qurvo-analytics"
RELEASE_NAME="qurvo"
NAMESPACE="default"
KUBECONFIG_PATH="$HELM_CHART/config.yaml"
export KUBECONFIG="$KUBECONFIG_PATH"

ALL_APPS=(api ingest processor cohort-worker billing-worker insights-worker monitor-worker scheduled-jobs-worker web landing storybook)
PLATFORM="linux/amd64"
SKIP_BUILD=false
NO_HOOKS=false
DEPLOY_DATADOG=false
TAG=""
ONLY=""

# ── Parse arguments ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true; shift ;;
    --no-hooks)   NO_HOOKS=true; shift ;;
    --datadog)    DEPLOY_DATADOG=true; shift ;;
    --tag)        TAG="$2"; shift 2 ;;
    --only)       ONLY="$2"; shift 2 ;;
    --help|-h)
      head -14 "$0" | tail -10
      exit 0
      ;;
    *) echo "ERROR: Unknown option: $1"; exit 1 ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────

# Read current helm values JSON (cached for the lifetime of the script)
HELM_VALUES_CACHE=""
get_helm_values() {
  if [[ -z "$HELM_VALUES_CACHE" ]]; then
    HELM_VALUES_CACHE=$(helm get values "$RELEASE_NAME" -n "$NAMESPACE" -o json 2>/dev/null || echo "")
  fi
  echo "$HELM_VALUES_CACHE"
}

# Get the currently deployed tag for a specific app (falls back to global)
get_current_tag() {
  local app="$1"
  local values
  values=$(get_helm_values)
  if [[ -z "$values" ]]; then
    echo ""
    return
  fi
  python3 -c "
import sys, json
v = json.loads(sys.argv[1])
app_tag = v.get('$app', {}).get('image', {}).get('tag', '')
global_tag = v.get('global', {}).get('imageTag', '')
print(app_tag or global_tag)
" "$values" 2>/dev/null || echo ""
}

# ── Validate --only apps ────────────────────────────────────────────────────
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

is_being_built() {
  local app="$1"
  for b in "${BUILD_APPS[@]}"; do
    [[ "$app" == "$b" ]] && return 0
  done
  return 1
}

# ── Resolve new tag ─────────────────────────────────────────────────────────
if [[ -z "$TAG" ]]; then
  if [[ "$SKIP_BUILD" == true ]]; then
    echo "ERROR: --skip-build requires --tag <tag>"
    exit 1
  fi
  TAG="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
fi

# ── Compute final per-app tags ──────────────────────────────────────────────
# Each app gets exactly one tag. For rebuilt apps — the new TAG.
# For non-rebuilt apps — their current deployed tag (preserved).
# Uses indirect variables (APP_TAG_<app>) for bash 3.2 compatibility.

set_app_tag() { local key="${1//-/_}"; eval "APP_TAG_$key=\$2"; }
get_app_tag() { local key="${1//-/_}"; eval "echo \$APP_TAG_$key"; }

if [[ -n "$ONLY" ]]; then
  # Partial deploy: read current tags for non-rebuilt apps
  for app in "${ALL_APPS[@]}"; do
    if is_being_built "$app"; then
      set_app_tag "$app" "$TAG"
    else
      current=$(get_current_tag "$app")
      if [[ -z "$current" ]]; then
        echo "ERROR: Cannot determine current tag for '$app'. Do a full deploy first."
        exit 1
      fi
      set_app_tag "$app" "$current"
    fi
  done
else
  # Full deploy: all apps get the new tag
  for app in "${ALL_APPS[@]}"; do
    set_app_tag "$app" "$TAG"
  done
fi

# ── Timeweb Container Registry auth ─────────────────────────────────────────
TWCR_TOKEN=$(python3 -c "
import re, sys
with open('$HELM_CHART/values.local-secrets.yaml') as f:
    m = re.search(r'timewebRegistryToken:\s*[\"\'](.*?)[\"\']\s*$', f.read(), re.MULTILINE)
    print(m.group(1) if m else '')
" 2>/dev/null)

if [[ -z "$TWCR_TOKEN" ]]; then
  echo "ERROR: timewebRegistryToken not found in values.local-secrets.yaml"
  exit 1
fi

echo "==> Logging in to $REGISTRY..."
echo "$TWCR_TOKEN" | docker login "$REGISTRY" -u token --password-stdin

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "==> Deploy plan:"
echo "    Registry: $REGISTRY"
echo ""
printf "    %-12s %-12s %s\n" "APP" "TAG" "ACTION"
printf "    %-12s %-12s %s\n" "───" "───" "──────"
for app in "${ALL_APPS[@]}"; do
  if is_being_built "$app" && [[ "$SKIP_BUILD" == false ]]; then
    action="build + deploy"
  elif is_being_built "$app"; then
    action="deploy (pre-built)"
  else
    action="keep"
  fi
  printf "    %-12s %-12s %s\n" "$app" "$(get_app_tag "$app")" "$action"
done
echo ""

# ── Build & push ─────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
  echo "==> Building: ${BUILD_APPS[*]}"

  PIDS=()
  for app in "${BUILD_APPS[@]}"; do
    if [[ "$app" == "web" || "$app" == "landing" || "$app" == "storybook" ]]; then
      TARGET="$app"
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

# ── Pre-deploy: fix stuck helm releases ─────────────────────────────────────
RELEASE_STATUS=$(helm status "$RELEASE_NAME" -n "$NAMESPACE" -o json 2>/dev/null | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['info']['status'])" 2>/dev/null || echo "not-found")

if [[ "$RELEASE_STATUS" == "pending-upgrade" || "$RELEASE_STATUS" == "pending-install" || "$RELEASE_STATUS" == "pending-rollback" ]]; then
  echo "==> WARNING: Release stuck in '$RELEASE_STATUS'. Rolling back..."
  helm rollback "$RELEASE_NAME" -n "$NAMESPACE" 2>&1
  echo "    Rollback complete."
  echo ""
fi

# ── Create/update registry pull secret in k8s ────────────────────────────────
echo "==> Syncing twcr-secret in Kubernetes..."
kubectl create secret docker-registry twcr-secret \
  --docker-server="$REGISTRY" \
  --docker-username=token \
  --docker-password="$TWCR_TOKEN" \
  -n "$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

# ── Deploy with Helm ─────────────────────────────────────────────────────────
echo "==> Deploying to Kubernetes..."

# global.imageTag = api tag (migrations use api image)
# Use --set-string to prevent Helm from interpreting numeric-looking tags as int64
HELM_SET_ARGS=(--set-string "global.imageTag=$(get_app_tag api)")

# Per-app tags
for app in "${ALL_APPS[@]}"; do
  HELM_SET_ARGS+=(--set-string "${app}.image.tag=$(get_app_tag "$app")")
done

HELM_EXTRA_ARGS=()
if [[ "$NO_HOOKS" == true ]]; then
  HELM_EXTRA_ARGS+=(--no-hooks)
fi

helm upgrade --install "$RELEASE_NAME" "$HELM_CHART" \
  --namespace "$NAMESPACE" \
  -f "$HELM_CHART/values.yaml" \
  -f "$HELM_CHART/values.production.yaml" \
  -f "$HELM_CHART/values.local-secrets.yaml" \
  "${HELM_SET_ARGS[@]}" \
  ${HELM_EXTRA_ARGS[@]+"${HELM_EXTRA_ARGS[@]}"} \
  --wait \
  --timeout 25m

# ── Deploy Datadog Agent (optional) ───────────────────────────────────────────
if [[ "$DEPLOY_DATADOG" == true ]]; then
  echo ""
  echo "==> Deploying Datadog Agent..."
  helm repo add datadog https://helm.datadoghq.com 2>/dev/null || true
  helm repo update datadog
  helm upgrade --install datadog-agent datadog/datadog \
    --namespace "$NAMESPACE" \
    -f "$REPO_ROOT/k8s/datadog/values-datadog.yaml" \
    --wait \
    --timeout 5m
  echo "    Datadog Agent deployed."
fi

echo ""
echo "==> Deploy complete!"
printf "    %-12s %s\n" "APP" "TAG"
printf "    %-12s %s\n" "───" "───"
for app in "${ALL_APPS[@]}"; do
  printf "    %-12s %s\n" "$app" "$(get_app_tag "$app")"
done
echo ""
kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME" --no-headers
