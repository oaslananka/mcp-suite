import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./smoke-prod-health.mjs", import.meta.url));

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function runNode(script, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: path.dirname(script),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test("external health mode runs from a dependency-free checkout", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "mcp-suite-health-smoke-"));
  const isolatedScript = path.join(root, "smoke-prod-health.mjs");
  await copyFile(scriptPath, isolatedScript);
  t.after(() => rm(root, { recursive: true, force: true }));

  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
  });
  const address = await listen(server);
  t.after(() => close(server));
  assert(address && typeof address === "object");

  const result = await runNode(isolatedScript, {
    FORGE_HEALTH_URL: `http://127.0.0.1:${address.port}/health`,
    ATLAS_HEALTH_URL: "",
    OBSERVATORY_HEALTH_URL: "",
    SENTINEL_HEALTH_URL: "",
  });

  assert.equal(result.signal, null);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Production smoke checks passed for forge\./);
});
