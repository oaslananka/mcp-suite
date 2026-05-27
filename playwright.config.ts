import { defineConfig, devices } from "@playwright/test";

const staticServers = [
  { directory: "packages/atlas/dist/ui", port: 4173 },
  { directory: "packages/observatory/dist/ui", port: 4174 },
  { directory: "apps/lab/dist/renderer", port: 4175 },
];

export default defineConfig({
  testDir: "./tests/ui-quality",
  outputDir: "test-results/playwright",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "test-results/playwright-report" }]]
    : "list",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  webServer: staticServers.map(({ directory, port }) => ({
    command: `node scripts/serve-static.mjs ${directory} ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  })),
  projects: [
    { name: "e2e", testMatch: "**/e2e.spec.ts" },
    { name: "a11y", testMatch: "**/a11y.spec.ts" },
    { name: "perf", testMatch: "**/perf.spec.ts" },
  ],
});
