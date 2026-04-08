import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "json-summary", "html", "cobertura"],
      reportsDirectory: "./coverage",
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80
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
        "**/src/renderer/**"
      ]
    },
    reporters: ["verbose", "junit"],
    outputFile: {
      junit: "./test-results/junit.xml"
    }
  }
});
