import { describe, expect, it } from "vitest";
import { IpcChannel } from "../src/main/ipc/channels.js";

describe("IpcChannel", () => {
  it("exports the canonical IPC channel map", () => {
    expect(IpcChannel.ConnectServer).toBe("mcp:connect");
    expect(IpcChannel.DeleteConnection).toBe("lab:delete-connection");
    expect(IpcChannel.DeleteAllConnections).toBe("lab:delete-all-connections");
    expect(IpcChannel.CallTool).toBe("mcp:call-tool");
    expect(IpcChannel.UpdateAvailable).toBe("lab:update-available");
    expect(IpcChannel.DeepLinkOpened).toBe("lab:deep-link-opened");
  });
});
