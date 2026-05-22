# Review Thread Gate

`scripts/check-review-threads.mjs` queries GitHub GraphQL `PullRequest.reviewThreads(first: 100)` for the current pull request.

The gate blocks:

- Unresolved human review threads.
- Unresolved actionable bot review threads.

The gate ignores:

- Resolved threads.
- Outdated threads.
- Pure informational bot comments without actionable keywords.

The workflow writes `review-thread-summary.json`, appends a Markdown job summary, and applies best-effort labels when permissions allow. Label updates never decide the gate result.
