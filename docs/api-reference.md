# Generated API Reference

The API reference is generated from TypeScript sources with TypeDoc and
`typedoc-plugin-markdown`.

## Local Generation

Linux/macOS:

```bash
pnpm docs:api
test -f docs/api/README.md
test -f docs/api/modules.md
```

Windows 11 PowerShell:

```powershell
pnpm docs:api
Test-Path docs/api/README.md
Test-Path docs/api/modules.md
```

`docs/api/` is generated output and is ignored by git. Regenerate it from source
when inspecting public API changes. Do not hand-edit generated files.

## CI Publication

The Docs workflow builds `docs/api/` on pull requests, pushes to `main`, and
manual dispatches. It uploads the generated tree as a workflow artifact named
`api-docs-<commit-sha>`.

To download the artifact after a run:

```bash
gh run download <run-id> --name api-docs-<commit-sha> --dir docs-api-artifact
```

```powershell
gh run download <run-id> --name api-docs-<commit-sha> --dir docs-api-artifact
```

The artifact is the verified generated output for review and release evidence.
A future public documentation site should publish from this generated tree
instead of committing `docs/api/`.
