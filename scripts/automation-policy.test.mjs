import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function packageDockerfiles() {
  const packagesDir = new URL("packages/", root);
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/Dockerfile`)
    .filter((path) => {
      try {
        read(path);
        return true;
      } catch {
        return false;
      }
    })
    .sort((left, right) => left.localeCompare(right));
}

function installCommands(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes("pnpm install --frozen-lockfile"));
}

test("Docker build contexts keep npm credentials excluded", () => {
  assert.match(read(".dockerignore"), /^\.npmrc$/m);

  for (const path of packageDockerfiles()) {
    assert.doesNotMatch(read(path), /COPY[^\n]*\.npmrc/, `${path} must not copy .npmrc`);
  }
});

test("automation installs dependencies without implicit lifecycle scripts", () => {
  const paths = [
    ".github/workflows/ci.yml",
    ".github/workflows/docs.yml",
    ".azure/templates/node-setup.yml",
    "scripts/bootstrap-devcontainer.sh",
    ...packageDockerfiles(),
  ];

  for (const path of paths) {
    const commands = installCommands(read(path));
    assert.ok(commands.length > 0, `${path} must contain a frozen-lockfile install`);
    for (const command of commands) {
      assert.match(command, /--ignore-scripts\b/, `${path}: ${command}`);
    }
  }
});

test("Docker base images use digest-only references", () => {
  for (const path of packageDockerfiles()) {
    const content = read(path);
    assert.doesNotMatch(content, /^FROM\s+\S+:\S+@sha256:/m, path);
    assert.match(content, /^FROM\s+\S+@sha256:[a-f0-9]{64}\s+AS\s+builder$/m, path);
    assert.match(content, /^FROM\s+\S+@sha256:[a-f0-9]{64}\s+AS\s+runtime$/m, path);
  }
});

test("devcontainer bootstrap uses safe Bash conditionals", () => {
  const content = read("scripts/bootstrap-devcontainer.sh");
  assert.match(content, /\[\[\s+-n\s+"\$\{pnpm_version\}"\s+\]\]/);
  assert.doesNotMatch(content, /^test\s+-n\s+/m);
});

test("container pull requests scan loaded images and publish SARIF before blocking", () => {
  const workflow = read(".github/workflows/containers.yml");

  assert.match(
    workflow,
    /uses:\s+aquasecurity\/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25/
  );
  assert.match(
    workflow,
    /uses:\s+github\/codeql-action\/upload-sarif@7188fc363630916deb702c7fdcf4e481b751f97a/
  );
  assert.match(workflow, /format:\s+sarif/);
  assert.match(workflow, /severity:\s+HIGH,CRITICAL/);
  assert.match(workflow, /exit-code:\s+["']?1["']?/);
  const blockingGate = workflow.split("Enforce HIGH and CRITICAL vulnerability gate")[1] ?? "";
  assert.match(blockingGate, /ignore-unfixed:\s+true/);
  assert.match(workflow, /load:\s+true/);
});

test("container publication signs and attests immutable multi-arch digests", () => {
  const workflow = read(".github/workflows/containers.yml");

  assert.match(workflow, /id-token:\s+write/);
  assert.match(workflow, /attestations:\s+write/);
  assert.match(workflow, /type=sha,prefix=sha-,format=long/);
  assert.match(
    workflow,
    /uses:\s+sigstore\/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6/
  );
  assert.match(workflow, /cosign sign --yes/);
  assert.match(workflow, /cosign verify/);
  assert.match(workflow, /uses:\s+actions\/attest@f7c74d28b9d84cb8768d0b8ca14a4bac6ef463e6/);
  assert.match(workflow, /push-to-registry:\s+true/);
  assert.match(workflow, /gh attestation verify/);
  assert.match(workflow, /linux\/amd64/);
  assert.match(workflow, /linux\/arm64/);
});

test("published-image smoke uses GHCR images without local builds", () => {
  const workflow = read(".github/workflows/containers.yml");
  const override = read("docker-compose.published.yml");

  assert.match(workflow, /docker-compose\.published\.yml/);
  assert.match(workflow, /--no-build/);
  assert.match(workflow, /scripts\/smoke-prod-health\.mjs/);
  assert.match(workflow, /for image in atlas bridge composer forge observatory sentinel/);
  assert.match(workflow, /node "packages\/\$\{image\}\/dist\/cli\.js" --help/);
  assert.match(override, /mcp-suite-forge:\$\{MCP_SUITE_IMAGE_TAG/);
  assert.match(override, /mcp-suite-atlas:\$\{MCP_SUITE_IMAGE_TAG/);
  assert.match(override, /mcp-suite-observatory:\$\{MCP_SUITE_IMAGE_TAG/);
  assert.doesNotMatch(override, /^\s*build:/m);
});

test("mutable container aliases are promoted only after immutable-image verification", () => {
  const workflow = read(".github/workflows/containers.yml");

  assert.match(workflow, /promote-main:[\s\S]*needs:\s*\[publish, smoke-published\]/);
  assert.match(workflow, /promote-release:[\s\S]*needs:\s*\[publish, smoke-published\]/);
  assert.match(workflow, /docker buildx imagetools create/);
  assert.match(workflow, /sha-\$\{GITHUB_SHA\}/);

  const publishSection = workflow.split(/^  publish:/m)[1]?.split(/^  smoke-published:/m)[0] ?? "";
  assert.doesNotMatch(publishSection, /value=latest/);
  assert.doesNotMatch(publishSection, /value=main/);
});

test("container attestation verification uses a checksum-pinned GitHub CLI", () => {
  const workflow = read(".github/workflows/containers.yml");

  assert.match(workflow, /GH_CLI_VERSION:\s*2\.96\.0/);
  assert.match(
    workflow,
    /GH_CLI_SHA256:\s*83d5c2ccad5498f58bf6368acb1ab32588cf43ab3a4b1c301bf36328b1c8bd60/
  );
  assert.match(workflow, /sha256sum --check/);
  assert.match(workflow, /gh_\$\{GH_CLI_VERSION\}_linux_amd64\.tar\.gz/);
  assert.match(workflow, /--bundle-from-oci/);
  assert.match(workflow, /--signer-workflow/);
  assert.match(workflow, /--source-ref/);
  assert.match(workflow, /--source-digest/);
});

test("runtime images contain production deploys without package managers or builder dependencies", () => {
  for (const path of packageDockerfiles()) {
    const content = read(path);
    assert.match(
      content,
      /pnpm --ignore-scripts --filter @oaslananka\/[a-z]+ deploy --legacy --prod \/deploy\/[a-z]+/,
      path
    );
    assert.match(content, /rm -rf \/usr\/local\/lib\/node_modules\/(npm|corepack)/, path);
    assert.match(content, /rm -f[\s\\\n]+\/usr\/local\/bin\/npm/, path);
    assert.doesNotMatch(content, /COPY --from=builder[^\n]*\/workspace\/node_modules/, path);
    assert.doesNotMatch(
      content,
      /COPY --from=builder[^\n]*\/workspace\/packages\/shared\/node_modules/,
      path
    );
  }
});

test("SQLite runtime deploys preserve the builder-verified native addon", () => {
  for (const packageName of ["atlas", "forge", "observatory", "sentinel"]) {
    const path = `packages/${packageName}/Dockerfile`;
    const content = read(path);
    assert.match(
      content,
      /find \/workspace\/node_modules -path '\*\/better-sqlite3\/build\/Release\/better_sqlite3\.node'/,
      path
    );
    assert.match(content, new RegExp(`/deploy/${packageName}/node_modules/better-sqlite3`), path);
    assert.match(
      content,
      /cp "\$\{source\}" "\$\{target\}\/build\/Release\/better_sqlite3\.node"/,
      path
    );
  }
});
