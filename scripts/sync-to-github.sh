#!/usr/bin/env bash
set +x
set -euo pipefail

readonly EXPECTED_DIRECTION="azure-to-github"
readonly TRACKING_REF="refs/remotes/mcp-suite-github/main"

fail() {
  printf 'Mirror refused: %s\n' "$1" >&2
  exit 1
}

[[ "${MIRROR_DIRECTION:-}" == "$EXPECTED_DIRECTION" ]] ||
  fail "MIRROR_DIRECTION must be ${EXPECTED_DIRECTION}; Azure DevOps is the authoritative source"

[[ "${GITHUB_REPO:-}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] ||
  fail "GITHUB_REPO must be an owner/repository name"

readonly EXPECTED_REMOTE_URL="https://github.com/${GITHUB_REPO}.git"
if [[ "${MIRROR_TEST_MODE:-0}" == "1" ]]; then
  readonly REMOTE_URL="${GITHUB_REMOTE_URL:-$EXPECTED_REMOTE_URL}"
else
  [[ -z "${GITHUB_REMOTE_URL:-}" || "${GITHUB_REMOTE_URL}" == "$EXPECTED_REMOTE_URL" ]] ||
    fail "GITHUB_REMOTE_URL overrides are allowed only in controlled tests"
  readonly REMOTE_URL="$EXPECTED_REMOTE_URL"
fi

[[ ! "$REMOTE_URL" =~ ^[A-Za-z][A-Za-z0-9+.-]*://[^/]*@ ]] ||
  fail "remote URLs must not contain credentials"

readonly AUTH_TOKEN="${GITHUB_APP_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ "$REMOTE_URL" == https://* && -z "$AUTH_TOKEN" ]]; then
  fail "a short-lived GITHUB_APP_TOKEN is required for HTTPS mirroring"
fi

ASKPASS_PATH="$(mktemp)"
cleanup() {
  rm -f "$ASKPASS_PATH"
  unset MIRROR_AUTH_TOKEN GITHUB_APP_TOKEN GITHUB_TOKEN
}
trap cleanup EXIT

cat >"$ASKPASS_PATH" <<'ASKPASS'
#!/usr/bin/env bash
set +x
case "${1:-}" in
  *Username*) printf '%s\n' "x-access-token" ;;
  *Password*) printf '%s\n' "${MIRROR_AUTH_TOKEN:?}" ;;
  *) exit 1 ;;
esac
ASKPASS
chmod 700 "$ASKPASS_PATH"

export GIT_ASKPASS="$ASKPASS_PATH"
export GIT_TERMINAL_PROMPT=0
export MIRROR_AUTH_TOKEN="$AUTH_TOKEN"
unset GITHUB_APP_TOKEN GITHUB_TOKEN

# Disable persistent/global credential helpers without writing repository configuration.
export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0="credential.helper"
export GIT_CONFIG_VALUE_0=""
export GIT_CONFIG_KEY_1="credential.useHttpPath"
export GIT_CONFIG_VALUE_1="true"

readonly LOCAL_HEAD="$(git rev-parse --verify HEAD)"
remote_main="$(git ls-remote --heads "$REMOTE_URL" refs/heads/main | awk 'NR == 1 { print $1 }')"

if [[ -n "$remote_main" ]]; then
  git fetch --quiet --no-tags "$REMOTE_URL" "+refs/heads/main:${TRACKING_REF}"
  if ! git merge-base --is-ancestor "$TRACKING_REF" "$LOCAL_HEAD"; then
    fail "GitHub main has diverged from the authoritative source; fast-forward recovery is required"
  fi
fi

# Validate tag immutability before changing main.
declare -A remote_tags=()
while read -r object_id ref_name; do
  [[ -n "${object_id:-}" && -n "${ref_name:-}" ]] || continue
  remote_tags["$ref_name"]="$object_id"
done < <(git ls-remote --tags --refs "$REMOTE_URL")

declare -a missing_tag_refspecs=()
while read -r object_id ref_name; do
  [[ -n "${object_id:-}" && -n "${ref_name:-}" ]] || continue
  remote_object_id="${remote_tags[$ref_name]:-}"
  if [[ -n "$remote_object_id" && "$remote_object_id" != "$object_id" ]]; then
    fail "tag conflict for ${ref_name}; existing GitHub tags are immutable"
  fi
  if [[ -z "$remote_object_id" ]]; then
    missing_tag_refspecs+=("${ref_name}:${ref_name}")
  fi
done < <(git for-each-ref --format='%(objectname) %(refname)' refs/tags)

git push --porcelain "$REMOTE_URL" HEAD:refs/heads/main
if (( ${#missing_tag_refspecs[@]} > 0 )); then
  git push --porcelain "$REMOTE_URL" "${missing_tag_refspecs[@]}"
fi

printf 'Mirror completed: main=%s tags_added=%d direction=%s\n' \
  "$LOCAL_HEAD" "${#missing_tag_refspecs[@]}" "$EXPECTED_DIRECTION"
