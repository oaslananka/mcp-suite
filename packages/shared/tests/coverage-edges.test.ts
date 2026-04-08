import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MCPSession } from "../src/client/session.js";
import { ErrorCodes, MCPError } from "../src/protocol/errors.js";
import { MCPRouter } from "../src/server/router.js";
import { createHistogram } from "../src/telemetry/metrics.js";
import { SpanStatusCode, tracer, withSpan } from "../src/telemetry/tracer.js";
import { MockTransport } from "../src/testing/MockTransport.js";
import { packBundle, unpackBundle } from "../src/utils/bundle.js";

describe("coverage edges", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempRoots.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("covers MCPError helper factories and preserves attached data", () => {
    const error = new MCPError(ErrorCodes.InternalError, "broken", { retry: false });

    expect(error.name).toBe("MCPError");
    expect(error.code).toBe(ErrorCodes.InternalError);
    expect(error.data).toEqual({ retry: false });

    expect(MCPError.parseError().code).toBe(ErrorCodes.ParseError);
    expect(MCPError.parseError("bad json").message).toBe("bad json");
    expect(MCPError.invalidRequest().code).toBe(ErrorCodes.InvalidRequest);
    expect(MCPError.invalidRequest("wrong").message).toBe("wrong");
    expect(MCPError.methodNotFound("tools/list").message).toContain("tools/list");
    expect(MCPError.invalidParams().code).toBe(ErrorCodes.InvalidParams);
    expect(MCPError.invalidParams("shape").message).toBe("shape");
    expect(MCPError.internalError().code).toBe(ErrorCodes.InternalError);
    expect(MCPError.internalError("kaput").message).toBe("kaput");
  });

  it("covers router request and notification branches", async () => {
    const router = new MCPRouter();
    const notificationHandler = vi.fn(async () => undefined);

    router.on("tools/list", async (params) => ({ params }));
    router.onNotification("notifications/custom", notificationHandler);

    await expect(router.handleRequest("tools/list", { ok: true })).resolves.toEqual({
      params: { ok: true },
    });
    await expect(router.handleRequest("missing", {})).rejects.toMatchObject({
      code: ErrorCodes.MethodNotFound,
    });

    await router.handleNotification("notifications/custom", { seen: true });
    await router.handleNotification("notifications/missing", { ignored: true });
    expect(notificationHandler).toHaveBeenCalledWith({ seen: true });
  });

  it("covers session sync success, failure, and call forwarding", async () => {
    const transport = new MockTransport();
    const session = new MCPSession(transport, {
      clientInfo: { name: "coverage-client", version: "1.0.0" },
    });
    const client = (
      session as unknown as {
        client: {
          connect: () => Promise<void>;
          disconnect: () => Promise<void>;
          listTools: () => Promise<{ tools: Array<{ name: string }> }>;
          listResources: () => Promise<{ resources: Array<{ uri: string }> }>;
          listPrompts: () => Promise<{ prompts: Array<{ name: string }> }>;
          callTool: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      }
    ).client;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.spyOn(client, "connect").mockResolvedValue(undefined);
    vi.spyOn(client, "disconnect").mockResolvedValue(undefined);
    vi.spyOn(client, "listTools")
      .mockResolvedValueOnce({ tools: [{ name: "alpha" }] })
      .mockRejectedValueOnce(new Error("tools down"));
    vi.spyOn(client, "listResources")
      .mockResolvedValueOnce({ resources: [{ uri: "file://demo.txt" }] })
      .mockRejectedValueOnce(new Error("resources down"));
    vi.spyOn(client, "listPrompts")
      .mockResolvedValueOnce({ prompts: [{ name: "hello" }] })
      .mockRejectedValueOnce(new Error("prompts down"));
    const callToolSpy = vi.spyOn(client, "callTool").mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
    });

    await session.start();
    expect(session.tools).toEqual([{ name: "alpha" }]);
    expect(session.resources).toEqual([{ uri: "file://demo.txt" }]);
    expect(session.prompts).toEqual([{ name: "hello" }]);

    await session.syncTools();
    await session.syncResources();
    await session.syncPrompts();

    expect(errorSpy).toHaveBeenCalledTimes(3);
    await expect(session.callTool("echo", { value: 1 })).resolves.toEqual({
      content: [{ type: "text", text: "ok" }],
    });
    expect(callToolSpy).toHaveBeenCalledWith("echo", { value: 1 });

    await session.stop();
    expect(client.disconnect).toHaveBeenCalled();
  });

  it("covers empty histograms and tracer error normalization", async () => {
    const histogram = createHistogram("latency", "Latency");
    expect(histogram.snapshot()).toEqual({
      count: 0,
      min: 0,
      max: 0,
      sum: 0,
      average: 0,
    });

    const snapshot = await tracer.startActiveSpan("manual-span", async (span) => {
      span.setAttribute("ok", true);
      span.end();
      span.end();
      const record = span.snapshot();
      expect(record.status).toBeUndefined();
      expect(record.attributes).toEqual({ ok: true });
      record.attributes["changed"] = false;
      return span.snapshot();
    });

    expect(snapshot.endedAt).toBeTypeOf("number");
    expect(snapshot.status).toBeUndefined();
    expect(snapshot.attributes).toEqual({ ok: true });

    await expect(
      withSpan("string-error", async () => {
        throw new Error("bad");
      })
    ).rejects.toThrow("bad");

    const okSnapshot = await tracer.startActiveSpan("ok-span", async (span) => {
      span.setStatus({ code: SpanStatusCode.OK });
      return span.snapshot();
    });
    expect(okSnapshot.status).toEqual({ code: SpanStatusCode.OK });
  });

  it("covers bundle failures for missing source directories and missing manifests", async () => {
    const sourceDir = path.join(os.tmpdir(), `mcp-suite-missing-${Date.now()}`);
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-suite-bundle-out-"));
    tempRoots.push(outputDir);

    await expect(
      packBundle(sourceDir, path.join(outputDir, "bundle.zip"), {
        name: "demo",
        version: "1.0.0",
        description: "demo bundle",
        entrypoint: "index.js",
        mcpVersion: "2025-11-25",
        transport: ["stdio"],
      })
    ).rejects.toThrow(`Directory ${sourceDir} does not exist`);

    const zip = new JSZip();
    zip.file("index.js", "console.log('hi')");
    const bundlePath = path.join(outputDir, "missing-manifest.zip");
    await fs.writeFile(bundlePath, await zip.generateAsync({ type: "nodebuffer" }));

    await expect(unpackBundle(bundlePath, path.join(outputDir, "unpacked"))).rejects.toThrow(
      "manifest.json not found in bundle"
    );
  });

  it("covers mock transport send, link, simulateMessage, and cascading close", async () => {
    const left = new MockTransport();
    const right = new MockTransport();
    left.link(right);

    const received: unknown[] = [];
    right.on("message", (message) => received.push(message));

    await expect(left.send({ jsonrpc: "2.0", method: "ping" })).rejects.toThrow(
      "Transport not started"
    );

    await left.start();
    await right.start();
    await left.send({ jsonrpc: "2.0", method: "ping" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(received).toEqual([{ jsonrpc: "2.0", method: "ping" }]);

    const localMessages: unknown[] = [];
    left.on("message", (message) => localMessages.push(message));
    left.simulateMessage({ jsonrpc: "2.0", method: "notifications/test", params: { ok: true } });
    expect(localMessages).toEqual([
      { jsonrpc: "2.0", method: "notifications/test", params: { ok: true } },
    ]);

    await left.close();
    expect(left.isStarted).toBe(false);
    expect(right.isStarted).toBe(false);
  });
});
