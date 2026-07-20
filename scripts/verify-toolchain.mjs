#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertExactVersion,
  readRepositoryContract,
  validateRepository,
} from "./toolchain-contract.mjs";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "--all";
const allowedModes = new Set(["--all", "--repository", "--runtime"]);

if (!allowedModes.has(mode)) {
  console.error(`Unknown mode ${mode}. Use --all, --repository, or --runtime.`);
  process.exit(2);
}

function readPnpmVersion() {
  const userAgent = process.env.npm_config_user_agent ?? "";
  const match = userAgent.match(/\bpnpm\/([^\s]+)/);
  if (match) return match[1];

  const result = spawnSync("pnpm", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "pnpm is unavailable").trim();
    throw new Error(`Unable to determine pnpm version: ${detail}`);
  }
  return result.stdout.trim();
}

try {
  const contract = readRepositoryContract(rootDir);

  if (mode === "--all" || mode === "--runtime") {
    const pnpmVersion = readPnpmVersion();
    assertExactVersion(process.version, contract.node, "Node.js");
    assertExactVersion(pnpmVersion, contract.pnpm, "pnpm");
    console.log(
      `Toolchain runtime OK: node=${process.version.replace(/^v/, "")} pnpm=${pnpmVersion} abi=${process.versions.modules}`,
    );
  }

  if (mode === "--all" || mode === "--repository") {
    validateRepository(rootDir, contract);
    console.log(
      `Toolchain repository contract OK: node=${contract.node} pnpm=${contract.pnpm}`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
