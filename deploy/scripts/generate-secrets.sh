#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

usage() {
  cat <<'EOF'
Kubi secret template helper

Usage:
  ./deploy/scripts/generate-secrets.sh <local|gcp>

Examples:
  ./deploy/scripts/generate-secrets.sh local
  ./deploy/scripts/generate-secrets.sh gcp

Outputs:
  local -> deploy/k8s/secrets/local/local.env.private
  gcp   -> deploy/k8s/secrets/external/gcp/secret-manager-values.private.env

Generated files are ignored by Git. Replace dummy values locally.
EOF
}

mode="${1:-help}"
case "$mode" in
  local)
    source="deploy/k8s/secrets/local/local.env.example"
    target="deploy/k8s/secrets/local/local.env.private"
    ;;
  gcp)
    source="deploy/k8s/secrets/external/gcp/secret-manager-values.example.env"
    target="deploy/k8s/secrets/external/gcp/secret-manager-values.private.env"
    ;;
  help|-h|--help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown mode '$mode'." >&2
    echo
    usage
    exit 1
    ;;
esac

if [ -f "$target" ]; then
  echo "Already exists: $target"
  exit 0
fi

cp "$source" "$target"
echo "Created $target with dummy values."
