#!/usr/bin/env bash
set -euo pipefail

# Creates the Kubernetes Secret for Datadog API key (idempotent).
# Usage: bash k8s/datadog/create-secret.sh

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KUBECONFIG_PATH="$REPO_ROOT/k8s/qurvo-analytics/config.yaml"
export KUBECONFIG="$KUBECONFIG_PATH"

NAMESPACE="default"
SECRET_NAME="datadog-api-key"

if [[ -z "${DD_API_KEY:-}" ]]; then
  echo "ERROR: DD_API_KEY environment variable is required."
  echo "Usage: DD_API_KEY=<your-key> bash k8s/datadog/create-secret.sh"
  exit 1
fi

echo "==> Creating secret '$SECRET_NAME' in namespace '$NAMESPACE'..."

kubectl create secret generic "$SECRET_NAME" \
  --namespace "$NAMESPACE" \
  --from-literal=api-key="$DD_API_KEY" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Secret '$SECRET_NAME' created/updated."
