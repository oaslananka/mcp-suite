import { afterEach, describe, expect, it, vi } from "vitest";

const scheduleMock = vi.hoisted(() => vi.fn());

vi.mock("node-cron", () => ({
  default: {
    schedule: scheduleMock
  }
}));

import { Scheduler } from "../src/runtime/Scheduler.js";

describe("Scheduler", () => {
  afterEach(() => {
    scheduleMock.mockReset();
    vi.restoreAllMocks();
  });

  it("schedules cron triggers, logs webhook triggers, and unschedules tasks", async () => {
    const stop = vi.fn();
    let callback: (() => Promise<void>) | undefined;
    scheduleMock.mockImplementation((_expression: string, handler: () => Promise<void>) => {
      callback = handler;
      return { stop };
    });

    const engine = {
      run: vi.fn().mockResolvedValue(undefined)
    };
    const scheduler = new Scheduler(engine as never);
    const pipelines = [
      {
        name: "nightly",
        version: "1",
        steps: [],
        triggers: [
          { type: "cron", schedule: "0 * * * *" },
          { type: "webhook", path: "/hooks/nightly" }
        ]
      }
    ];

    scheduler.scheduleAll(pipelines as never);
    await callback?.();
    scheduler.unscheduleAll();

    expect(scheduleMock).toHaveBeenCalledWith("0 * * * *", expect.any(Function));
    expect(engine.run).toHaveBeenCalledWith(pipelines[0], {}, false);
    expect(stop).toHaveBeenCalled();
  });
});
