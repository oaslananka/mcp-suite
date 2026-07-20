import { describe, expect, it, vi } from "vitest";
import {
  assertPublicHttpUrl,
  assertPublicIpAddress,
  resolvePublicHttpUrl,
} from "../src/security/urlPolicy.js";

describe("public URL policy", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "64:ff9b::1",
    "100::1",
    "2001:db8::1",
    "2002::1",
    "3fff::1",
    "fc00::1",
    "fe80::1",
    "ff00::1",
  ])("rejects private, special-use, or reserved address %s", (address) => {
    expect(() => assertPublicIpAddress(address)).toThrow(/not allowed|reserved|private/i);
  });

  it("normalizes malformed URLs into non-reflective policy errors", async () => {
    const target = "https://[secret-target";
    let thrown: unknown;

    try {
      await resolvePublicHttpUrl(target);
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("HTTP URL policy: invalid URL");
    expect(JSON.stringify(thrown)).not.toContain(target);
    expect(thrown).not.toHaveProperty("input");
  });

  it("rejects URL credentials before DNS resolution", async () => {
    const lookup = vi.fn();

    await expect(
      resolvePublicHttpUrl("https://user:password@example.com/schema.yaml", { lookup })
    ).rejects.toThrow(/credentials/i);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("fails closed when DNS returns a mix of public and private addresses", async () => {
    await expect(
      resolvePublicHttpUrl("https://schemas.example.com/openapi.yaml", {
        lookup: async () => [
          { address: "93.184.216.34", family: 4 },
          { address: "127.0.0.1", family: 4 },
        ],
      })
    ).rejects.toThrow(/private|reserved|not allowed/i);
  });

  it("allows private resolution only for an explicitly trusted hostname", async () => {
    const resolved = await resolvePublicHttpUrl("https://schemas.corp.example/openapi.yaml", {
      trustedPrivateHosts: ["schemas.corp.example"],
      lookup: async () => [{ address: "10.20.30.40", family: 4 }],
    });

    expect(resolved.addresses).toEqual([{ address: "10.20.30.40", family: 4 }]);
  });
  it("supports URL objects, explicit HTTP opt-in, allowed hosts, and DNS-free review", async () => {
    const reviewed = await resolvePublicHttpUrl(new URL("http://93.184.216.34/schema.yaml"), {
      requireHttps: false,
      allowedHosts: ["93.184.216.34"],
      resolveDns: false,
    });

    expect(reviewed.url.protocol).toBe("http:");
    expect(reviewed.addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
    await expect(
      assertPublicHttpUrl("https://schemas.example.com/openapi.yaml", {
        allowedHosts: ["schemas.example.com"],
        resolveDns: false,
      })
    ).resolves.toHaveProperty("hostname", "schemas.example.com");
  });

  it("rejects unsupported protocols, disallowed hosts, and localhost names", async () => {
    await expect(resolvePublicHttpUrl("file:///tmp/schema.yaml")).rejects.toThrow(/only HTTP/i);
    await expect(
      resolvePublicHttpUrl("https://schemas.example.com/openapi.yaml", {
        allowedHosts: ["other.example.com"],
        resolveDns: false,
      })
    ).rejects.toThrow(/allowed host policy/i);
    await expect(
      resolvePublicHttpUrl("https://api.localhost/openapi.yaml", { resolveDns: false })
    ).rejects.toThrow(/localhost/i);
  });

  it("accepts public IPv4, IPv6, and IPv4-mapped IPv6 literals", () => {
    expect(() => assertPublicIpAddress("8.8.8.8")).not.toThrow();
    expect(() => assertPublicIpAddress("2606:4700:4700::1111")).not.toThrow();
    expect(() => assertPublicIpAddress("::ffff:8.8.8.8")).not.toThrow();
    expect(() => assertPublicIpAddress("not-an-address")).toThrow(/valid IP/i);
  });

  it("normalizes resolver failures, empty answers, single answers, and duplicates", async () => {
    await expect(
      resolvePublicHttpUrl("https://schemas.example.com/openapi.yaml", {
        lookup: async () => {
          throw new Error("resolver detail must not escape");
        },
      })
    ).rejects.toThrow("HTTP URL policy: target host could not be resolved");
    await expect(
      resolvePublicHttpUrl("https://schemas.example.com/openapi.yaml", {
        lookup: async () => [],
      })
    ).rejects.toThrow(/did not resolve/i);

    const single = await resolvePublicHttpUrl("https://schemas.example.com/openapi.yaml", {
      lookup: async () => ({ address: "93.184.216.34", family: 4 }),
    });
    expect(single.addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);

    const deduplicated = await resolvePublicHttpUrl("https://schemas.example.com/openapi.yaml", {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "93.184.216.34", family: 4 },
      ],
    });
    expect(deduplicated.addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });
});
