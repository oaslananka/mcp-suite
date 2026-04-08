import { describe, expect, it } from "vitest";
import { IPC, IpcChannel } from "../src/main/ipc/channels.js";

describe("IpcChannel", () => {
  it("exports the canonical IPC channel map", () => {
    expect(IpcChannel.ConnectServer).toBe("mcp:connect");
    expect(IpcChannel.CallTool).toBe("mcp:call-tool");
    expect(IpcChannel.UpdateAvailable).toBe("lab:update-available");
    expect(IpcChannel.DeepLinkOpened).toBe("lab:deep-link-opened");
    expect(IPC).toBe(IpcChannel);
  });
});
