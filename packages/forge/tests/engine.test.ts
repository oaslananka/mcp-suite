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

  it("handles adversarial ReDoS input without catastrophic backtracking", () => {
    const transformer = new Transformer();
    const ctx = { value: "test" };

    const adversarialInput = "{{".repeat(5000) + " value }}";
    const start = Date.now();
    const result = transformer.transform(adversarialInput, ctx);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result).toContain("[EvalError:");
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

  it("handles unclosed expression braces gracefully", () => {
    const transformer = new Transformer();
    const ctx = { user: "Alice" };
    const result = transformer.transform("Hello {{ user", ctx);
    expect(result).toBe("Hello {{ user");
  });

  it("handles mixed closed and unclosed expressions", () => {
    const transformer = new Transformer();
    const ctx = { a: 1, b: 2 };
    const result = transformer.transform("{{ a }} and {{ b", ctx);
    expect(result).toBe("1 and {{ b");
  });

  it("handles long repeated open delimiters without closing delimiter in linear time", () => {
    const transformer = new Transformer();
    const ctx = { value: "test" };

    const adversarialInput = "{{".repeat(5000) + " value }}";
    const start = Date.now();
    const result = transformer.transform(adversarialInput, ctx);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(result).toContain("[EvalError:");
  });
});
