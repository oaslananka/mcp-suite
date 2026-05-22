#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GITHUB_TOKEN:-}" || -z "${GITHUB_REPO:-}" ]]; then
  echo "GITHUB_TOKEN and GITHUB_REPO must be set"
  exit 1
fi

REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"

if git remote get-url github >/dev/null 2>&1; then
  git remote set-url github "${REMOTE_URL}"
else
  git remote add github "${REMOTE_URL}"
fi

git push github HEAD:main --force-with-lease
git push github --tags
