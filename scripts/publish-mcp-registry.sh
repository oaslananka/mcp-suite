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

registry_has_version() {
  local server_name="$1"
  local server_version="$2"
  node -e "const https=require('node:https'); const base=process.argv[3].replace(/\/+$/, ''); const url=new URL(base + '/v0.1/servers'); url.searchParams.set('search', process.argv[1]); https.get(url, (res) => { let data=''; res.on('data', (chunk) => data += chunk); res.on('end', () => { try { const payload = JSON.parse(data); const match = Array.isArray(payload.servers) ? payload.servers.find((entry) => entry.server?.name === process.argv[1] && entry.server?.version === process.argv[2]) : undefined; process.exit(match ? 0 : 1); } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(2); } }); }).on('error', (error) => { console.error(error.message); process.exit(2); });" "${server_name}" "${server_version}" "${publisher_registry}"
}

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
  server_name="$(node -e "const fs=require('node:fs'); const server=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(server.name);" "${server_file}")"
  server_version="$(node -e "const fs=require('node:fs'); const server=JSON.parse(fs.readFileSync(process.argv[1], 'utf8')); console.log(server.version);" "${server_file}")"

  if registry_has_version "${server_name}" "${server_version}"; then
    echo "Skipping ${server_name}@${server_version}; registry already has this publication"
    continue
  fi

  echo "Publishing MCP registry metadata from ${server_file}"
  "${publisher_bin}" publish "${server_file}"
done
