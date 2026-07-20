# GitHub mirror contract

Azure DevOps is the authoritative source for this one-way mirror. The mirror job may advance GitHub `main` only when the update is a fast-forward and may add only previously absent tags. It never rewrites `main`, existing tags, release tags, or signed tags.

## Credential contract

The job must receive a short-lived, least-privilege GitHub App installation token as the secret variable `GITHUB_APP_TOKEN`. The installation should be restricted to this repository with **Contents: write** and **Metadata: read** permissions. Generate the token immediately before the mirror stage and do not reuse it in later jobs.

The synchronization script authenticates through an ephemeral `GIT_ASKPASS` helper. It does not add or modify a Git remote, place the token in a URL or command argument, or enable shell tracing. Repository and global credential helpers are disabled for the process so the token cannot be persisted by Git.

## Required variables

- `MIRROR_DIRECTION=azure-to-github`
- `GITHUB_REPO=oaslananka/mcp-suite`
- `GITHUB_APP_TOKEN=<short-lived installation token>`

`GITHUB_REMOTE_URL` and `MIRROR_TEST_MODE=1` exist only for the controlled local integration tests.

## Divergence and recovery

If GitHub `main` is not an ancestor of the checked-out authoritative commit, the job exits before pushing. Do not force the branch. Review the unexpected GitHub commits, move the authoritative source forward through a normal reviewed change, and rerun the mirror after the histories share a fast-forward path.

If an existing tag points to a different object, the job exits before changing `main`. Existing tags are immutable. Resolve the release discrepancy manually; never delete or force-update a published tag from automation.

A failed network push is safe to retry. Main and tag pushes are non-forced and GitHub rejects concurrent conflicting updates.

## Validation

Run:

```bash
pnpm run toolchain:test
```

The mirror policy tests use temporary local bare repositories to verify fast-forward updates, immutable tags, divergence failure, token redaction, and clean `.git/config` state.
