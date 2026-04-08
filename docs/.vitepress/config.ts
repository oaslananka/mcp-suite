import { defineConfig } from "vitepress";

export default defineConfig({
  title: "MCP Infrastructure Suite",
  description: "Azure-first operational tooling for production MCP ecosystems.",
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/introduction" },
      { text: "Packages", link: "/packages/index" },
      { text: "GitHub", link: "https://github.com/oaslananka/mcp-suite" }
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Introduction", link: "/guide/introduction" },
          { text: "Quick Start", link: "/guide/quick-start" },
          { text: "Installation", link: "/guide/installation" },
          { text: "Architecture", link: "/guide/architecture" }
        ]
      },
      {
        text: "Packages",
        items: [
          { text: "Overview", link: "/packages/index" },
          { text: "Shared", link: "/packages/shared" },
          { text: "Forge", link: "/packages/forge" },
          { text: "Sentinel", link: "/packages/sentinel" },
          { text: "Atlas", link: "/packages/atlas" },
          { text: "Composer", link: "/packages/composer" },
          { text: "Bridge", link: "/packages/bridge" },
          { text: "Observatory", link: "/packages/observatory" },
          { text: "Lab", link: "/packages/lab" }
        ]
      }
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/oaslananka/mcp-suite" }
    ]
  }
});
