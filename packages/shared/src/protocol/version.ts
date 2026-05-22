/**
 * Latest MCP protocol version advertised by the suite.
 */
export const LATEST_PROTOCOL_VERSION = "2025-11-25";

/**
 * Legacy MCP protocol version retained for compatibility during the 1.0 transition.
 */
export const LEGACY_PROTOCOL_VERSION = "2025-11-05";

export const SUPPORTED_PROTOCOL_VERSIONS = [
  LATEST_PROTOCOL_VERSION,
  LEGACY_PROTOCOL_VERSION,
] as const;

export type SupportedProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

export function isSupportedProtocolVersion(version: string): version is SupportedProtocolVersion {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(version as SupportedProtocolVersion);
}

export function negotiateProtocolVersion(requestedVersion: string): SupportedProtocolVersion {
  if (isSupportedProtocolVersion(requestedVersion)) {
    return requestedVersion;
  }

  return LATEST_PROTOCOL_VERSION;
}
