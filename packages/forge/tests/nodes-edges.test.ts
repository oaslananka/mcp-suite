import { describe, expect, it, vi } from "vitest";
import { ConditionNode } from "../src/nodes/ConditionNode.js";
import { DelayNode } from "../src/nodes/DelayNode.js";
import { LogNode } from "../src/nodes/LogNode.js";
import { LoopNode } from "../src/nodes/LoopNode.js";
import { ParallelNode } from "../src/nodes/ParallelNode.js";
import { ToolCallNode } from "../src/nodes/ToolCallNode.js";
import { RunContext } from "../src/runtime/RunContext.js";

function createContext(): RunContext {
  const connectionManager = { getClient: vi.fn() };
  const ctx = new RunContext("run-edges", "pipeline-edges", {}, connectionManager as never, {
    tools: { transport: "http", url: "https://api.example.com" },
  });

  ctx.logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as never;

  return ctx;
}

describe("Forge node edge branches", () => {
  it("covers condition false and missing definition paths", async () => {
    const ctx = createContext();
    ctx.dataBus.set("approved", false);
    const node = new ConditionNode();

    await expect(
      node.execute(
        {
          id: "condition",
          type: "condition",
          condition: "approved",
          on_true: "yes",
          on_false: "no",
        },
        ctx
      )
    ).resolves.toMatchObject({ nextStepIds: ["no"], output: false, status: "success" });
    await expect(
      node.execute({ id: "condition", type: "condition" } as never, ctx)
    ).resolves.toEqual({
      status: "failed",
      error: "Missing condition definition",
    });
  });

  it("covers delay units and definition failures", async () => {
    const ctx = createContext();
    const node = new DelayNode();

    await expect(
      node.execute({ id: "ms", type: "delay", duration: "0ms" }, ctx)
    ).resolves.toMatchObject({
      output: "Delayed 0ms",
      status: "success",
    });
    await expect(
      node.execute({ id: "m", type: "delay", duration: "0m" }, ctx)
    ).resolves.toMatchObject({
      output: "Delayed 0ms",
      status: "success",
    });
    await expect(
      node.execute({ id: "h", type: "delay", duration: "0h" }, ctx)
    ).resolves.toMatchObject({
      output: "Delayed 0ms",
      status: "success",
    });
    await expect(
      node.execute({ id: "missing", type: "delay" } as never, ctx)
    ).resolves.toMatchObject({
      status: "failed",
      error: "Missing duration definition",
    });
    await expect(
      node.execute({ id: "days", type: "delay", duration: "2d" }, ctx)
    ).resolves.toMatchObject({
      status: "failed",
      error: "Invalid duration unit: 2d",
    });
  });

  it("routes log levels and validates message definitions", async () => {
    const ctx = createContext();
    const node = new LogNode();

    await expect(
      node.execute({ id: "debug", type: "log", message: "debug", level: "debug" }, ctx)
    ).resolves.toMatchObject({
      output: "debug",
      status: "success",
    });
    await expect(
      node.execute({ id: "info", type: "log", message: "info" }, ctx)
    ).resolves.toMatchObject({
      output: "info",
      status: "success",
    });
    await expect(
      node.execute({ id: "error", type: "log", message: "error", level: "error" }, ctx)
    ).resolves.toMatchObject({
      output: "error",
      status: "success",
    });
    await expect(node.execute({ id: "missing", type: "log" } as never, ctx)).resolves.toMatchObject(
      {
        error: "Missing message definition",
        status: "failed",
      }
    );
    expect(ctx.logger.debug).toHaveBeenCalledWith("debug");
    expect(ctx.logger.info).toHaveBeenCalledWith("info");
    expect(ctx.logger.error).toHaveBeenCalledWith("error");
  });

  it("fails parallel and loop nodes on invalid child definitions", async () => {
    const ctx = createContext();
    const parallelNode = new ParallelNode();
    const loopNode = new LoopNode();
    ctx.dataBus.set("items", ["one"]);

    await expect(
      parallelNode.execute({ id: "parallel", type: "parallel" } as never, ctx)
    ).resolves.toMatchObject({
      error: "Parallel node missing steps array",
      status: "failed",
    });
    await expect(
      parallelNode.execute(
        {
          id: "parallel",
          type: "parallel",
          steps: [{ id: "bad", type: "delay", duration: "bad" }],
        },
        ctx
      )
    ).resolves.toMatchObject({ status: "failed" });
    await expect(
      loopNode.execute({ id: "loop", type: "loop" } as never, ctx)
    ).resolves.toMatchObject({
      error: "Loop node missing over, as, or steps array",
      status: "failed",
    });
    await expect(
      loopNode.execute(
        {
          id: "loop",
          type: "loop",
          over: "{{ items }}",
          as: "item",
          steps: [{ id: "bad", type: "delay", duration: "bad" }],
        },
        ctx
      )
    ).resolves.toMatchObject({ status: "failed" });
  });

  it("covers tool-call error results and non-Error rejections", async () => {
    const ctx = createContext();
    const node = new ToolCallNode();
    const callTool = vi
      .fn()
      .mockResolvedValueOnce({ isError: true, content: [] })
      .mockRejectedValueOnce("offline");
    (ctx.connectionManager.getClient as ReturnType<typeof vi.fn>).mockResolvedValue({ callTool });

    await expect(
      node.execute({ id: "tool", server: "tools", tool: "first", input: {} }, ctx)
    ).resolves.toMatchObject({
      error: "Tool execution returned error",
      status: "failed",
    });
    await expect(
      node.execute({ id: "tool", server: "tools", tool: "second", input: {} }, ctx)
    ).resolves.toMatchObject({
      error: "Tool call failed",
      status: "failed",
    });
    await expect(
      node.execute({ id: "tool", server: "tools", input: {} } as never, ctx)
    ).rejects.toThrow("Not a tool call step");
  });
});
