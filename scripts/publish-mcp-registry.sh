#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${MCP_GITHUB_TOKEN:-}" ]]; then
  echo "MCP_GITHUB_TOKEN must be set"
  exit 1
fi

publisher_version="${MCP_PUBLISHER_VERSION:-v1.5.0}"
publisher_registry="${MCP_REGISTRY_URL:-https://registry.modelcontextprotocol.io}"
publisher_dir="$(mktemp -d)"
publisher_bin="${publisher_dir}/mcp-publisher"
prepared_dir="${MCP_REGISTRY_OUTPUT_DIR:-.mcp-registry-release}"

cleanup() {
  rm -rf "${publisher_dir}"
}
trap cleanup EXIT

curl -L "https://github.com/modelcontextprotocol/registry/releases/download/${publisher_version}/mcp-publisher_linux_amd64.tar.gz" \
  | tar xz -C "${publisher_dir}" mcp-publisher

node scripts/prepare-mcp-registry-publication.mjs

manifest_path="${prepared_dir}/manifest.json"
if [[ ! -f "${manifest_path}" ]]; then
  echo "MCP Registry manifest not found at ${manifest_path}"
  exit 1
fi

mapfile -t server_files < <(node -e "const fs=require('node:fs'); const manifest=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); for (const entry of manifest.files) console.log(entry.file);" "${manifest_path}")

if [[ "${#server_files[@]}" -eq 0 ]]; then
  echo "No prepared server.json files found for publishing"
  exit 1
fi

"${publisher_bin}" login github -registry "${publisher_registry}" -token "${MCP_GITHUB_TOKEN}"

for server_file in "${server_files[@]}"; do
  echo "Publishing MCP registry metadata from ${server_file}"
  "${publisher_bin}" publish "${server_file}"
done
