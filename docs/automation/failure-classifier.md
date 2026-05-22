# Failure Classifier

`scripts/classify-gh-failure.mjs` reads a failed log from a file path argument or standard input and emits JSON with:

- `classification`
- `root_cause`
- `recommended_fix`
- `auto_fix_allowed`
- `human_approval_required`
- `publish_must_stop`

The classifier recognizes workflow lint, zizmor, secret scan, CodeQL, dependency audit, Docker, test, typecheck, lint, package build, release, metadata, MCP metadata, package upload, trusted publishing, marketplace, Cloudflare, artifact attestation, GitHub Actions account or billing locks, flaky infrastructure, and unknown failures.

GitHub Actions account or billing locks require manual account remediation, stop publishing, and should be rerun after the account state is corrected.
