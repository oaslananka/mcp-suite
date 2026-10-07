/**
 * Latest MCP protocol version advertised by the suite.
 */
export declare const LATEST_PROTOCOL_VERSION = "2025-11-25";
/**
 * Legacy MCP protocol version retained for compatibility during the 1.0 transition.
 */
export declare const LEGACY_PROTOCOL_VERSION = "2025-11-05";
export declare const SUPPORTED_PROTOCOL_VERSIONS: readonly ["2025-11-25", "2025-11-05"];
export type SupportedProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];
export declare function isSupportedProtocolVersion(version: string): version is SupportedProtocolVersion;
export declare function negotiateProtocolVersion(requestedVersion: string): SupportedProtocolVersion;
//# sourceMappingURL=version.d.ts.map