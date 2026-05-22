import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@oaslananka/atlas": fileURLToPath(new URL("./packages/atlas/src/index.ts", import.meta.url)),
      "@oaslananka/bridge": fileURLToPath(
        new URL("./packages/bridge/src/index.ts", import.meta.url)
      ),
      "@oaslananka/composer": fileURLToPath(
        new URL("./packages/composer/src/index.ts", import.meta.url)
      ),
      "@oaslananka/forge": fileURLToPath(new URL("./packages/forge/src/index.ts", import.meta.url)),
      "@oaslananka/observatory": fileURLToPath(
        new URL("./packages/observatory/src/index.ts", import.meta.url)
      ),
      "@oaslananka/sentinel": fileURLToPath(
        new URL("./packages/sentinel/src/index.ts", import.meta.url)
      ),
      "@oaslananka/shared": fileURLToPath(
        new URL("./packages/shared/src/index.ts", import.meta.url)
      ),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary", "html", "cobertura"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
      exclude: [
        "**/dist/**",
        "**/node_modules/**",
        "**/*.config.*",
        "**/cli.ts",
        "**/index.ts",
        "**/ui/**",
        "**/src/main/index.ts",
        "**/src/main/storage/**",
        "**/src/renderer/**",
      ],
    },
    reporters: ["verbose", "junit"],
    outputFile: {
      junit: "./test-results/junit.xml",
    },
  },
});
