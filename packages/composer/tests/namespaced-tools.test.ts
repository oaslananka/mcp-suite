import { describe, expect, it } from "vitest";
import { NamespacedTools } from "../src/proxy/NamespacedTools.js";

describe("NamespacedTools", () => {
  it("adds and strips backend namespaces from tool names", () => {
    const tool = NamespacedTools.add(
      {
        name: "search",
        description: "Search code",
        inputSchema: { type: "object" },
      },
      "github",
    );

    expect(tool.name).toBe("github__search");
    expect(NamespacedTools.strip("github__search")).toEqual({
      backendName: "github",
      toolName: "search",
    });
    expect(() => NamespacedTools.strip("search")).toThrow("missing namespace separator");
  });
});
