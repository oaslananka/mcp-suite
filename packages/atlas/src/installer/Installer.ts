import { MCPServerRecord } from "../registry/ServerStore.js";

export interface InstallResult {
  success: boolean;
  configSnippet: string;
  verificationResult: { ok: boolean; message: string };
}

export class Installer {
  async install(serverRecord: MCPServerRecord, _dest: string): Promise<InstallResult> {
    return {
      success: true,
      configSnippet: JSON.stringify(
        {
          mcpServers: {
            [serverRecord.name]: {
              command: serverRecord.installCommand
            }
          }
        },
        null,
        2
      ),
      verificationResult: {
        ok: true,
        message: `Prepared install command for ${serverRecord.name}`
      }
    };
  }

  async uninstall(_serverRecord: MCPServerRecord): Promise<void> {
    return;
  }

  async upgrade(_serverRecord: MCPServerRecord): Promise<void> {
    return;
  }
}
