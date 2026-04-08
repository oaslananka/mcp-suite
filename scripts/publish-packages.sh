#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${NPM_TOKEN:-}" ]]; then
  echo "NPM_TOKEN must be set"
  exit 1
fi

cat > "${HOME}/.npmrc" <<EOF
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
EOF

pnpm build
pnpm changeset publish
