#!/usr/bin/env bash
set -euo pipefail

pnpm_version="$(awk '$1 == "pnpm" { print $2 }' .tool-versions)"
test -n "${pnpm_version}"

corepack enable
corepack prepare "pnpm@${pnpm_version}" --activate
node scripts/verify-toolchain.mjs --runtime
pnpm install --frozen-lockfile
pnpm run toolchain:check:native
