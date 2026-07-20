import { describe, expect, it } from "vitest";
import { resolveTrustedPrivateHosts } from "../src/security/RemoteSchemaConfig.js";

describe("resolveTrustedPrivateHosts", () => {
  it("uses explicit CLI hosts before the environment fallback", () => {
    expect(
      resolveTrustedPrivateHosts(
        ["Schemas.Corp.Example", "[fd00::10]", "schemas.corp.example"],
        "ignored.example"
      )
    ).toEqual(["schemas.corp.example", "fd00::10"]);
  });

  it("parses a comma-separated environment fallback", () => {
    expect(resolveTrustedPrivateHosts(undefined, "one.corp.example, two.corp.example")).toEqual([
      "one.corp.example",
      "two.corp.example",
    ]);
  });

  it.each([
    "*.corp.example",
    "https://schemas.corp.example",
    "schemas.corp.example/path",
    "user@schemas.corp.example",
    "schemas.corp.example:8443",
  ])("rejects non-exact trusted-host policy value %s", (host) => {
    expect(() => resolveTrustedPrivateHosts([host])).toThrow(/exact hostname or IP literal/i);
  });
});
