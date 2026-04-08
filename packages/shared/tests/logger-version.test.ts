import { afterEach, describe, expect, it } from "vitest";
import {
    LEGACY_PROTOCOL_VERSION,
    LATEST_PROTOCOL_VERSION,
    SUPPORTED_PROTOCOL_VERSIONS,
    isSupportedProtocolVersion,
    negotiateProtocolVersion,
} from "../src/protocol/version.js";
import { createLogger } from "../src/utils/logger.js";

const ORIGINAL_NODE_ENV = process.env["NODE_ENV"];
const ORIGINAL_LOG_LEVEL = process.env["LOG_LEVEL"];

describe("protocol version helpers", () => {
    it("accepts supported versions and falls back to the latest version otherwise", () => {
        expect(SUPPORTED_PROTOCOL_VERSIONS).toEqual([
            LATEST_PROTOCOL_VERSION,
            LEGACY_PROTOCOL_VERSION,
        ]);
        expect(isSupportedProtocolVersion(LATEST_PROTOCOL_VERSION)).toBe(true);
        expect(isSupportedProtocolVersion(LEGACY_PROTOCOL_VERSION)).toBe(true);
        expect(isSupportedProtocolVersion("2024-10-01")).toBe(false);

        expect(negotiateProtocolVersion(LATEST_PROTOCOL_VERSION)).toBe(LATEST_PROTOCOL_VERSION);
        expect(negotiateProtocolVersion(LEGACY_PROTOCOL_VERSION)).toBe(LEGACY_PROTOCOL_VERSION);
        expect(negotiateProtocolVersion("2024-10-01")).toBe(LATEST_PROTOCOL_VERSION);
    });
});

describe("createLogger", () => {
    afterEach(() => {
        if (ORIGINAL_NODE_ENV === undefined) {
            delete process.env["NODE_ENV"];
        } else {
            process.env["NODE_ENV"] = ORIGINAL_NODE_ENV;
        }

        if (ORIGINAL_LOG_LEVEL === undefined) {
            delete process.env["LOG_LEVEL"];
        } else {
            process.env["LOG_LEVEL"] = ORIGINAL_LOG_LEVEL;
        }
    });

    it("creates a production logger using LOG_LEVEL and custom bindings", () => {
        process.env["NODE_ENV"] = "test";
        process.env["LOG_LEVEL"] = "debug";

        const testLogger = createLogger({ service: "shared-tests" });

        expect(testLogger.level).toBe("debug");
        expect(testLogger.bindings()).toMatchObject({ service: "shared-tests" });
    });

    it("creates a development logger with pretty transport enabled", () => {
        process.env["NODE_ENV"] = "development";
        delete process.env["LOG_LEVEL"];

        const testLogger = createLogger({ scope: "dev" });

        expect(testLogger.level).toBe("info");
        expect(testLogger.bindings()).toMatchObject({ scope: "dev" });
    });
});
