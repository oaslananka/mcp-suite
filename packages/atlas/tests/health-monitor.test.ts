import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthMonitor } from "../src/registry/HealthMonitor.js";
import { ServerStore } from "../src/registry/ServerStore.js";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

describe("HealthMonitor", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    lookupMock.mockReset();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("checks HTTP servers and records uptime", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const record = store.add({
      name: "Atlas API",
      packageName: "@oaslananka/atlas",
      version: "1.0.0",
      description: "Registry API",
      author: "oaslananka",
      transport: ["http"],
      tags: ["registry"],
      installCommand: "npx -y @oaslananka/atlas",
      homepage: "https://atlas.example.com",
      license: "Apache-2.0",
      verified: true,
      downloads: 10,
      rating: 5,
    });

    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    const monitor = new HealthMonitor(store);
    const result = await monitor.checkServer(record.id);

    expect(result.status).toBe("online");
    expect(monitor.getUptime(record.id, 1)).toBe(100);
  });

  it("marks failed probes as offline", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const record = store.add({
      name: "Broken API",
      packageName: "@oaslananka/broken",
      version: "1.0.0",
      description: "Broken server",
      author: "team",
      transport: ["http"],
      tags: ["broken"],
      installCommand: "npx -y @oaslananka/broken",
      homepage: "https://broken.example.com",
      license: "Apache-2.0",
      verified: true,
      downloads: 0,
      rating: 0,
    });

    globalThis.fetch = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));

    const monitor = new HealthMonitor(store);
    const result = await monitor.checkServer(record.id);

    expect(result.status).toBe("offline");
    expect(monitor.getUptime(record.id, 1)).toBe(0);
  });

  it("blocks private HTTP health-check targets before fetching", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const record = store.add({
      name: "Private API",
      packageName: "@oaslananka/private",
      version: "1.0.0",
      description: "Private server",
      author: "team",
      transport: ["http"],
      tags: ["private"],
      installCommand: "npx -y @oaslananka/private",
      homepage: "http://169.254.169.254",
      license: "Apache-2.0",
      verified: true,
      downloads: 0,
      rating: 0,
    });
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    const monitor = new HealthMonitor(store);
    const result = await monitor.checkServer(record.id);

    expect(result.status).toBe("offline");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("blocks redirect-to-private health-check responses", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const record = store.add({
      name: "Redirecting API",
      packageName: "@oaslananka/redirecting",
      version: "1.0.0",
      description: "Redirecting server",
      author: "team",
      transport: ["http"],
      tags: ["redirect"],
      installCommand: "npx -y @oaslananka/redirecting",
      homepage: "https://redirect.example.com",
      license: "Apache-2.0",
      verified: true,
      downloads: 0,
      rating: 0,
    });
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/health" },
      })
    );

    const monitor = new HealthMonitor(store);
    const result = await monitor.checkServer(record.id);

    expect(result.status).toBe("offline");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("checks stdio servers and rejects unknown server ids", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const record = store.add({
      name: "CLI Tool",
      packageName: "@oaslananka/cli-tool",
      version: "1.0.0",
      description: "CLI only server",
      author: "team",
      transport: ["stdio"],
      tags: ["cli"],
      installCommand: "npx -y @oaslananka/cli-tool",
      license: "Apache-2.0",
      verified: true,
      downloads: 5,
      rating: 4,
    });

    const monitor = new HealthMonitor(store);
    const result = await monitor.checkServer(record.id);

    expect(result.status).toBe("online");
    await expect(monitor.checkServer("missing-id")).rejects.toThrow("Server not found");
  });

  it("checks only verified servers when running the full sweep", async () => {
    const store = new ServerStore(new Database(":memory:"));
    const verified = store.add({
      name: "Verified API",
      packageName: "@oaslananka/verified",
      version: "1.0.0",
      description: "Verified server",
      author: "team",
      transport: ["http"],
      tags: ["verified"],
      installCommand: "npx -y @oaslananka/verified",
      homepage: "https://verified.example.com",
      license: "Apache-2.0",
      verified: true,
      downloads: 1,
      rating: 5,
    });
    store.add({
      name: "Community API",
      packageName: "@oaslananka/community",
      version: "1.0.0",
      description: "Community server",
      author: "team",
      transport: ["http"],
      tags: ["community"],
      installCommand: "npx -y @oaslananka/community",
      homepage: "https://community.example.com",
      license: "Apache-2.0",
      verified: false,
      downloads: 1,
      rating: 4,
    });

    const monitor = new HealthMonitor(store);
    const checkSpy = vi
      .spyOn(monitor, "checkServer")
      .mockResolvedValue({ serverId: verified.id, status: "online", responseMs: 1 });

    await monitor.checkAll();

    expect(checkSpy).toHaveBeenCalledTimes(1);
    expect(checkSpy).toHaveBeenCalledWith(verified.id);
  });

  it("schedules recurring checks and stops cleanly", async () => {
    vi.useFakeTimers();
    const store = new ServerStore(new Database(":memory:"));
    const monitor = new HealthMonitor(store);
    const checkAllSpy = vi.spyOn(monitor, "checkAll").mockResolvedValue(undefined);

    await monitor.start(25);
    await vi.advanceTimersByTimeAsync(80);
    const callCountAfterStart = checkAllSpy.mock.calls.length;

    expect(callCountAfterStart).toBeGreaterThanOrEqual(3);

    await monitor.stop();
    await vi.advanceTimersByTimeAsync(80);

    expect(checkAllSpy).toHaveBeenCalledTimes(callCountAfterStart);
  });
});
