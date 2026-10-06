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

  it("supports strings containing single braces inside templates", () => {
    const transformer = new Transformer();
    const ctx = { message: "hello {world}" };
    const result = transformer.transform("{{ message }}", ctx);
    expect(result).toBe("hello {world}");
  });

  it("supports expressions with braces in string literals", () => {
    const transformer = new Transformer();
    const ctx = { val: "hello {world}" };
    const result = transformer.transform("{{ val }}", ctx);
    expect(result).toBe("hello {world}");
  });

  it("supports pipe expressions with braces in string arguments", () => {
    const transformer = new Transformer();
    const ctx = { text: "hello {world}" };
    const result = transformer.transform("{{ text | uppercase }}", ctx);
    expect(result).toBe("HELLO {WORLD}");
  });

  it("handles multiple expressions with braces in same template", () => {
    const transformer = new Transformer();
    const ctx = { a: "{first}", b: "{second}" };
    const result = transformer.transform("{{ a }} and {{ b }}", ctx);
    expect(result).toBe("{first} and {second}");
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
});
