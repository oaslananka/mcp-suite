import { readFile } from "node:fs/promises";
import path from "node:path";

const summaryPath = path.resolve(process.cwd(), "packages/shared/coverage/coverage-summary.json");
const thresholds = {
  statements: 90,
  branches: 85,
  lines: 90,
};

const summary = JSON.parse(await readFile(summaryPath, "utf8"));
const total = summary.total ?? {};

for (const [metric, threshold] of Object.entries(thresholds)) {
  const current = total[metric]?.pct;
  if (typeof current !== "number") {
    throw new Error(`Coverage summary missing "${metric}" at ${summaryPath}`);
  }

  if (current < threshold) {
    throw new Error(`Shared coverage for ${metric} is ${current}%, below required ${threshold}%`);
  }
}

console.log(
  `Shared coverage passed: statements ${total.statements.pct}%, branches ${total.branches.pct}%, lines ${total.lines.pct}%`,
);
