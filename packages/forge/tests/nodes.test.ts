import { afterEach, describe, expect, it, vi } from "vitest";
import { ConditionNode } from "../src/nodes/ConditionNode.js";
import { DelayNode } from "../src/nodes/DelayNode.js";
import { LogNode } from "../src/nodes/LogNode.js";
import { LoopNode } from "../src/nodes/LoopNode.js";
import { ParallelNode } from "../src/nodes/ParallelNode.js";
import { ToolCallNode } from "../src/nodes/ToolCallNode.js";
import { createNode } from "../src/nodes/factory.js";
import { RunContext } from "../src/runtime/RunContext.js";

function createContext(): RunContext {
  const connectionManager = {
    getClient: vi.fn()
  };
  const ctx = new RunContext(
    "run-1",
    "pipeline-1",
    { greeting: "world" },
    connectionManager as never,
    {
      tools: { transport: "http", url: "https://api.example.com" }
    }
  );

  ctx.logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn()
  } as never;

  return ctx;
}

describe("Forge nodes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("evaluates condition nodes and chooses the next branch", async () => {
    const ctx = createContext();
    ctx.dataBus.set("approved", true);
    const node = new ConditionNode();

    const result = await node.execute(
      {
        id: "check-approval",
        type: "condition",
        condition: "approved",
        on_true: "deploy",
        on_false: "skip"
      },
      ctx
    );

    expect(result).toEqual({
      status: "success",
      output: true,
      nextStepIds: ["deploy"]
    });
  });

  it("runs loop and parallel nodes with nested child steps", async () => {
    const ctx = createContext();
    ctx.dataBus.set("items", [{ name: "Ada" }, { name: "Linus" }]);

    const loopNode = new LoopNode();
    const parallelNode = new ParallelNode();

    const loopResult = await loopNode.execute(
      {
        id: "loop",
        type: "loop",
        over: "{{ items }}",
        as: "item",
        steps: [
          { id: "echo", type: "log", message: "Hello {{ item.name }}" }
        ]
      },
      ctx
    );
    const parallelResult = await parallelNode.execute(
      {
        id: "parallel",
        type: "parallel",
        steps: [
          { id: "first", type: "log", message: "First" },
          { id: "second", type: "log", message: "Second" }
        ]
      },
      ctx
    );

    expect(loopResult).toMatchObject({
      status: "success",
      output: [{ echo: "Hello Ada" }, { echo: "Hello Linus" }]
    });
    expect(parallelResult).toEqual({
      status: "success",
      output: {
        first: "First",
        second: "Second"
      }
    });
  });

  it("logs messages, parses delays, and reports invalid durations", async () => {
    vi.useFakeTimers();
    const ctx = createContext();
    const logNode = new LogNode();
    const delayNode = new DelayNode();

    const logResult = await logNode.execute(
      {
        id: "warn",
        type: "log",
        message: "Hello {{ greeting }}",
        level: "warn"
      },
      ctx
    );

    const delayedExecution = delayNode.execute(
      {
        id: "wait",
        type: "delay",
        duration: "2s"
      },
      ctx
    );
    await vi.advanceTimersByTimeAsync(2000);
    const delayResult = await delayedExecution;

    const invalidDelay = await delayNode.execute(
      {
        id: "broken",
        type: "delay",
        duration: "later"
      },
      ctx
    );

    expect(logResult).toEqual({ status: "success", output: "Hello world" });
    expect((ctx.logger.warn as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("Hello world");
    expect(delayResult).toEqual({ status: "success", output: "Delayed 2000ms" });
    expect(invalidDelay).toEqual({
      status: "failed",
      error: "Invalid duration format: later"
    });
  });

  it("resolves tool inputs recursively and retries transient tool failures", async () => {
    vi.useFakeTimers();
    const ctx = createContext();
    ctx.dataBus.set("ticket", { id: 42, owner: { name: "Ada" } });
    const callTool = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ isError: false, content: [{ type: "text", text: "ok" }] });
    (ctx.connectionManager.getClient as ReturnType<typeof vi.fn>).mockResolvedValue({ callTool });

    const node = new ToolCallNode();
    const execution = node.execute(
      {
        id: "tool",
        server: "tools",
        tool: "createTicket",
        input: {
          id: "{{ ticket.id }}",
          owner: { name: "{{ ticket.owner.name }}" }
        },
        retry: {
          max_attempts: 2,
          backoff: "exponential"
        }
      },
      ctx
    );

    await vi.runAllTimersAsync();
    const result = await execution;

    expect(ctx.connectionManager.getClient).toHaveBeenCalledWith("tools", { transport: "http", url: "https://api.example.com" });
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(callTool).toHaveBeenNthCalledWith(1, "createTicket", {
      id: 42,
      owner: { name: "Ada" }
    });
    expect(result).toEqual({
      status: "success",
      output: { isError: false, content: [{ type: "text", text: "ok" }] }
    });
  });

  it("creates node implementations from step config and rejects unknown step types", () => {
    expect(createNode({ id: "tool", server: "tools", tool: "list", input: {} })).toBeInstanceOf(ToolCallNode);
    expect(
      createNode({
        id: "http",
        type: "http",
        url: "https://example.com",
        method: "GET"
      })
    ).toBeDefined();

    expect(() =>
      createNode({
        id: "unknown",
        type: "something-else"
      } as never)
    ).toThrow("Unknown step type: something-else");
  });
});
