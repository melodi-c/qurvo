#!/usr/bin/env bash
set -euo pipefail

# Deploys Datadog Agent to the Qurvo Kubernetes cluster.
# Prerequisites: run create-secret.sh first.
#
# Usage: bash k8s/datadog/deploy-datadog.sh

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
KUBECONFIG_PATH="$REPO_ROOT/k8s/qurvo-analytics/config.yaml"
export KUBECONFIG="$KUBECONFIG_PATH"

NAMESPACE="default"
RELEASE_NAME="datadog-agent"
VALUES_FILE="$(dirname "$0")/values-datadog.yaml"

echo "==> Adding Datadog Helm repo..."
helm repo add datadog https://helm.datadoghq.com 2>/dev/null || true
helm repo update datadog

echo ""
echo "==> Deploying Datadog Agent..."
helm upgrade --install "$RELEASE_NAME" datadog/datadog \
  --namespace "$NAMESPACE" \
  -f "$VALUES_FILE" \
  --wait \
  --timeout 5m

echo ""
echo "==> Datadog Agent deployed!"
kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=datadog --no-headers
