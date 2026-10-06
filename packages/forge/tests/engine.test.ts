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

  it.each([
    [
      "direct value with single braces",
      { message: "hello {world}" },
      "{{ message }}",
      "hello {world}",
    ],
    ["string literal with single braces", { val: "hello {world}" }, "{{ val }}", "hello {world}"],
    [
      "pipe expression with single braces in argument",
      { text: "hello {world}" },
      "{{ text | uppercase }}",
      "HELLO {WORLD}",
    ],
    [
      "multiple expressions with single braces",
      { a: "{first}", b: "{second}" },
      "{{ a }} and {{ b }}",
      "{first} and {second}",
    ],
  ])("handles single braces in %s", (_name, ctx, template, expected) => {
    const transformer = new Transformer();
    const result = transformer.transform(template, ctx);
    expect(result).toBe(expected);
  });

  it("handles template with only closing braces in expression", () => {
    const transformer = new Transformer();
    const ctx = { val: "test" };
    const result = transformer.transform("{{ val }}", ctx);
    expect(result).toBe("test");
  });

  it("correctly stops at double closing braces not single braces", () => {
    const transformer = new Transformer();
    const ctx = { val: "test" };
    const result = transformer.transform("{{ val }} and {{ val }}", ctx);
    expect(result).toBe("test and test");
  });

  it("handles empty braces in expression context", () => {
    const transformer = new Transformer();
    const ctx = { empty: "" };
    const result = transformer.transform("{{ empty }}", ctx);
    expect(result).toBe("");
  });

  it("handles repeated unmatched opening delimiters without backtracking", () => {
    const transformer = new Transformer();
    const ctx = { val: "x" };
    const template = "{{{{{{{{{{ val }}"; // 5 opening pairs, 1 closing
    const result = transformer.transform(template, ctx);
    // Last {{ before }} is the 5th pair at index 8; text before = 4 pairs = 8 '{' chars
    expect(result).toBe("{{{{{{{{x");
  });

  it("handles large template with many unmatched opening pairs linearly", () => {
    const transformer = new Transformer();
    const ctx = { val: "ok" };
    const openPairs = 500;
    const template = "{{".repeat(openPairs) + " val }}";
    const start = Date.now();
    const result = transformer.transform(template, ctx);
    const elapsed = Date.now() - start;
    // Last {{ before }} is the 500th pair at index 998; text before = 499 pairs = 998 '{' chars
    expect(result).toBe("{".repeat(openPairs * 2 - 2) + "ok");
    expect(elapsed).toBeLessThan(500);
  });
});
