import { codecovVitePlugin } from "@codecov/vite-plugin";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    codecovVitePlugin({
      enableBundleAnalysis: process.env["CODECOV_BUNDLE_ANALYSIS"] === "true",
      bundleName: "mcp-suite-observatory-ui",
      gitService: "github",
      oidc: { useGitHubOIDC: true },
      telemetry: false,
    }),
  ],
  build: {
    outDir: path.resolve(__dirname, "../dist/ui"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
  },
});
