import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { RegistryServer } from "../../packages/atlas/src/registry/RegistryServer.js";
import { ServerStore } from "../../packages/atlas/src/registry/ServerStore.js";

describe("Atlas API integration", () => {
  let server: RegistryServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("serves catalog, detail, tags, trending, submission, and health endpoints over HTTP", async () => {
    server = new RegistryServer(new ServerStore(new Database(":memory:")));
    const port = await server.listen(0);
    const baseUrl = `http://127.0.0.1:${port}`;

    const search = await fetch(`${baseUrl}/api/servers?q=github`).then(async (response) => ({
      status: response.status,
      body: (await response.json()) as { items: Array<{ id: string; name: string }> },
    }));
    expect(search.status).toBe(200);
    expect(search.body.items.some((item) => item.name.toLowerCase().includes("github"))).toBe(true);

    const tags = await fetch(`${baseUrl}/api/tags`).then((response) => response.json() as Promise<{ tags: string[] }>);
    expect(tags.tags.length).toBeGreaterThan(0);

    const trending = await fetch(`${baseUrl}/api/trending`).then(
      (response) => response.json() as Promise<{ items: Array<{ id: string }> }>,
    );
    expect(trending.items.length).toBeGreaterThan(0);

    const submission = await fetch(`${baseUrl}/api/submissions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Team Registry",
        packageName: "@oaslananka/team-registry",
        description: "Internal registry helper",
        transport: ["http"],
        homepage: "https://registry.example.com",
      }),
    }).then((response) => response.json() as Promise<{ id: string }>);

    const detail = await fetch(`${baseUrl}/api/servers/${submission.id}`).then(
      (response) =>
        response.json() as Promise<{
          name: string;
          homepage?: string;
        }>,
    );
    expect(detail).toMatchObject({
      name: "Team Registry",
      homepage: "https://registry.example.com",
    });

    const health = await fetch(`${baseUrl}/health`).then(
      (response) => response.json() as Promise<{ status: string; total: number }>,
    );
    expect(health.status).toBe("ok");
    expect(health.total).toBeGreaterThan(0);
  });
});
