import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const budgets = [
  {
    name: "Atlas UI",
    path: "packages/atlas/dist/ui",
    rawBudget: 180_000,
    gzipBudget: 58_000,
  },
  {
    name: "Observatory UI",
    path: "packages/observatory/dist/ui",
    rawBudget: 620_000,
    gzipBudget: 185_000,
  },
  {
    name: "Lab renderer",
    path: "apps/lab/dist/renderer",
    rawBudget: 380_000,
    gzipBudget: 92_000,
  },
  {
    name: "Shared package",
    path: "packages/shared/dist",
    rawBudget: 195_000,
    gzipBudget: 49_000,
  },
  {
    name: "Forge package",
    path: "packages/forge/dist",
    rawBudget: 285_000,
    gzipBudget: 67_000,
  },
  {
    name: "Sentinel package",
    path: "packages/sentinel/dist",
    rawBudget: 275_000,
    gzipBudget: 66_000,
  },
  {
    name: "Atlas package",
    path: "packages/atlas/dist",
    rawBudget: 430_000,
    gzipBudget: 122_000,
  },
  {
    name: "Composer package",
    path: "packages/composer/dist",
    rawBudget: 36_000,
    gzipBudget: 11_000,
  },
  {
    name: "Bridge package",
    path: "packages/bridge/dist",
    rawBudget: 49_000,
    gzipBudget: 16_000,
  },
  {
    name: "Observatory package",
    path: "packages/observatory/dist",
    rawBudget: 690_000,
    gzipBudget: 202_000,
  },
];

const results = await Promise.all(budgets.map(measureBudget));
const failures = results.filter(
  (result) => result.raw > result.rawBudget || result.gzip > result.gzipBudget
);

for (const result of results) {
  const rawStatus = result.raw <= result.rawBudget ? "PASS" : "FAIL";
  const gzipStatus = result.gzip <= result.gzipBudget ? "PASS" : "FAIL";
  console.log(
    `${result.name}: raw ${formatBytes(result.raw)} / ${formatBytes(result.rawBudget)} ${rawStatus}; gzip ${formatBytes(result.gzip)} / ${formatBytes(result.gzipBudget)} ${gzipStatus}; files ${result.files}`
  );
}

if (failures.length > 0) {
  throw new Error(`Size budgets exceeded: ${failures.map((failure) => failure.name).join(", ")}`);
}

async function measureBudget(budget) {
  const directory = path.resolve(budget.path);
  const files = await walk(directory);
  let raw = 0;
  let gzip = 0;

  for (const file of files) {
    const contents = await readFile(file);
    raw += contents.byteLength;
    gzip += gzipSync(contents).byteLength;
  }

  return {
    ...budget,
    raw,
    gzip,
    files: files.length,
  };
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function formatBytes(value) {
  return `${(value / 1024).toFixed(1)} KiB`;
}
