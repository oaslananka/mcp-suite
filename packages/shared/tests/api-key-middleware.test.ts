import { describe, expect, it } from "vitest";
import { ApiKeyMiddleware } from "../src/auth/ApiKeyMiddleware.js";
import { MCPError, ErrorCodes } from "../src/protocol/errors.js";

describe("ApiKeyMiddleware", () => {
    const middleware = new ApiKeyMiddleware(async (apiKey) => {
        if (apiKey === "secret") {
            return { id: "user-1", scopes: ["tools:read"] };
        }

        return null;
    });

    it("extracts and authorizes a bearer token", async () => {
        const principal = await middleware.authorize({
            authorization: "Bearer secret",
        });

        expect(principal.id).toBe("user-1");
    });

    it("rejects missing or malformed tokens", async () => {
        await expect(middleware.authorize({})).rejects.toMatchObject<MCPError>({
            code: ErrorCodes.Unauthorized,
        });

        await expect(middleware.authorize({
            authorization: "Token secret",
        })).rejects.toMatchObject<MCPError>({
            code: ErrorCodes.Unauthorized,
        });
    });

    it("enforces required scopes", async () => {
        await expect(middleware.ensureScope({
            authorization: "Bearer secret",
        }, "tools:write")).rejects.toMatchObject<MCPError>({
            code: ErrorCodes.Unauthorized,
        });
    });
});
