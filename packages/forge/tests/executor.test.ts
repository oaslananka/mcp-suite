import { afterEach, describe, expect, it, vi } from "vitest";
import { RunContext } from "../src/runtime/RunContext.js";

const executeMock = vi.hoisted(() => vi.fn());

vi.mock("../src/engine/Step.js", () => ({
  Step: vi.fn().mockImplementation(() => ({
    execute: executeMock
  }))
}));

import { Executor } from "../src/engine/Executor.js";

function createContext(): RunContext {
  const ctx = new RunContext("run-1", "pipeline-1", {}, undefined, {});
  ctx.logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn()
  } as never;
  return ctx;
}

describe("Executor", () => {
  afterEach(() => {
    executeMock.mockReset();
    vi.clearAllMocks();
  });

  it("executes serial groups and stores named outputs in the data bus", async () => {
    const pipeline = {
      getExecutionOrder: () => [["announce"]],
      getStep: (id: string) =>
        id === "announce"
          ? {
              id,
              type: "log",
              message: "hello",
              output_as: "announcement"
            }
          : undefined
    };
    executeMock.mockResolvedValue({ status: "success", output: "hello" });
    const ctx = createContext();
    const executor = new Executor({} as never, {} as never);

    await executor.execute(pipeline as never, ctx);

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(ctx.dataBus.get("announcement")).toBe("hello");
  });

  it("skips execution work in dry-run mode", async () => {
    const pipeline = {
      getExecutionOrder: () => [["announce"]],
      getStep: () => ({
        id: "announce",
        type: "log",
        message: "hello"
      })
    };
    const ctx = createContext();
    const executor = new Executor({} as never, {} as never, true);

    await executor.execute(pipeline as never, ctx);

    expect(executeMock).not.toHaveBeenCalled();
  });

  it("rejects when a parallel step group contains a failed step", async () => {
    const pipeline = {
      getExecutionOrder: () => [["first", "second"]],
      getStep: (id: string) => ({
        id,
        type: "log",
        message: id
      })
    };
    executeMock
      .mockResolvedValueOnce({ status: "success", output: "one" })
      .mockResolvedValueOnce({ status: "failed", error: "boom" });
    const ctx = createContext();
    const executor = new Executor({} as never, {} as never);

    await expect(executor.execute(pipeline as never, ctx)).rejects.toThrow("Parallel step second failed: boom");
  });

  it("logs global errors through the run context logger", async () => {
    const ctx = createContext();
    const executor = new Executor({} as never, {} as never);

    await executor.handleGlobalError({}, ctx, new Error("pipeline exploded"));

    expect(ctx.logger.error).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "Global error handler triggered"
    );
  });
});
