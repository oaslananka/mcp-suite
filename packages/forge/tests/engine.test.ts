import { describe, it, expect } from "vitest";
import { Transformer } from "../src/engine/Transformer.js";

describe("Transformer", () => {
  it("transforms basic templates", () => {
    const transformer = new Transformer();
    const ctx = { user: { name: "Alice" } };
    const result = transformer.transform("Hello {{ user.name }}", ctx);
    expect(result).toBe("Hello Alice");
  });

  it("evaluates object expressions directly", () => {
    const transformer = new Transformer();
    const ctx = { pr: { labels: ["bug", "needs-ticket"] } };
    const result = transformer.transform("{{ pr.labels }}", ctx);
    expect(result).toEqual(["bug", "needs-ticket"]);
  });

  it("handles many unclosed template openers in linear time", () => {
    const transformer = new Transformer();
    const adversarialInput = "{{".repeat(10_000);

    const start = Date.now();
    const result = transformer.transform(adversarialInput, {});
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result).toBe(adversarialInput);
  });

  it("handles nested braces in expressions correctly", () => {
    const transformer = new Transformer();
    const ctx = { obj: { nested: { value: "deep" } } };
    const result = transformer.transform("{{ obj.nested.value }}", ctx);
    expect(result).toBe("deep");
  });

  it("handles multiple expressions in one template", () => {
    const transformer = new Transformer();
    const ctx = { a: 1, b: 2 };
    const result = transformer.transform("{{ a }} and {{ b }}", ctx);
    expect(result).toBe("1 and 2");
  });
});
