#!/usr/bin/env bash
set -euo pipefail

pnpm_version="$(awk '$1 == "pnpm" { print $2 }' .tool-versions)"
[[ -n "${pnpm_version}" ]]

corepack enable
corepack prepare "pnpm@${pnpm_version}" --activate
TOOLCHAIN_PNPM_VERSION="${pnpm_version}" node scripts/verify-toolchain.mjs --runtime
pnpm install --frozen-lockfile --ignore-scripts
pnpm rebuild better-sqlite3 electron esbuild
pnpm run toolchain:check:native
