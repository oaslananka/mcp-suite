import { readFile } from "node:fs/promises";

const inputPath = process.argv[2];
const input = inputPath ? await readFile(inputPath, "utf8") : await readStdin();
const text = input.toLowerCase();

const classifiers = [
  ["workflow syntax/actionlint", /actionlint|invalid workflow|yaml|mapping values|workflow is not valid/u, true, false, true],
  ["zizmor finding", /zizmor|template-injection|unpinned-uses|dangerous-triggers/u, true, false, true],
  ["secret scan finding", /gitleaks|secret scanning|private key|token detected|password/u, false, true, true],
  ["CodeQL finding", /codeql|security-events|sarif|code scanning/u, false, true, true],
  ["dependency audit finding", /pnpm audit|vulnerab|ghsa|cve-/u, true, false, true],
  ["Docker build failure", /docker build|docker compose|buildx|failed to solve/u, true, false, true],
  ["test failure", /vitest|test files|failed tests|assertionerror/u, true, false, true],
  ["typecheck failure", /tsc|typecheck|typescript|ts\d{4}/u, true, false, true],
  ["lint failure", /eslint|lint/u, true, false, true],
  ["package build failure", /tsup|vite build|turbo.*build/u, true, false, true],
  ["release tag/version mismatch", /release-please|tag.*version|manifest.*version/u, true, false, true],
  ["metadata drift", /metadata drift|package-name|manifest entry/u, true, false, true],
  ["MCP metadata drift", /mcp.*metadata|smithery|server\.json|mcp\.json/u, true, false, true],
  ["wrong package upload directory", /no such file.*tgz|wrong.*pack|package directory/u, true, false, true],
  ["non-package assets uploaded to registries", /sbom.*npm publish|checksum.*npm publish|non-package/u, true, false, true],
  ["npm trusted publishing mismatch", /npm.*provenance|trusted publishing|oidc/u, false, true, true],
  ["PyPI/TestPyPI trusted publishing mismatch", /pypi|testpypi|twine|trusted publisher/u, false, true, true],
  ["VSIX invalid", /vsix|vsce|extension manifest/u, true, false, true],
  ["VS Marketplace/Open VSX publish failure", /marketplace|open vsx|ovsx/u, false, true, true],
  ["MCP Registry auth/schema failure", /mcp registry|mcp-publisher|registry schema/u, false, true, true],
  ["Cloudflare publish failure", /cloudflare|wrangler/u, false, true, true],
  ["artifact attestation/provenance failure", /attestation|provenance|slsa/u, true, false, true],
  ["GitHub Actions account/billing blocker", /account is locked|billing issue|spending limit|included minutes/u, false, true, true],
  ["flaky/infra failure", /timeout|timed out|connection reset|rate limit|503|502/u, false, false, false],
];

const match = classifiers.find(([, pattern]) => pattern.test(text));
const [classification, , autoFixAllowed, humanApprovalRequired, publishMustStop] = match ?? ["unknown", null, false, true, true];

process.stdout.write(`${JSON.stringify({
  classification,
  root_cause: summarize(classification),
  recommended_fix: recommend(classification),
  auto_fix_allowed: autoFixAllowed,
  human_approval_required: humanApprovalRequired,
  publish_must_stop: publishMustStop,
}, null, 2)}\n`);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function summarize(classification) {
  return classification === "unknown"
    ? "The failure did not match a known signature."
    : `The log matches the ${classification} failure signature.`;
}

function recommend(classification) {
  const fixes = {
    "GitHub Actions account/billing blocker": "Resolve the GitHub Actions account or billing lock, then rerun the failed workflow jobs without changing repository code.",
    "flaky/infra failure": "Re-run only after confirming no repository change can address the outage.",
    unknown: "Inspect the full failed job log and add a deterministic classifier once the root cause is known.",
  };
  return fixes[classification] ?? "Fix the exact failing check locally, add regression coverage when applicable, and rerun the targeted gate.";
}
