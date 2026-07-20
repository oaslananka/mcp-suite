import assert from "node:assert/strict";
import test from "node:test";

import { formatNativeModuleFailure, verifySqliteModule } from "./native-module-check.mjs";

test("verifySqliteModule executes a query and closes the database", () => {
  const events = [];

  class FakeDatabase {
    constructor(filename) {
      events.push(["open", filename]);
    }

    prepare(sql) {
      events.push(["prepare", sql]);
      return {
        get() {
          events.push(["get"]);
          return { value: 1 };
        },
      };
    }

    close() {
      events.push(["close"]);
    }
  }

  const result = verifySqliteModule(FakeDatabase);

  assert.deepEqual(result, { value: 1 });
  assert.deepEqual(events, [
    ["open", ":memory:"],
    ["prepare", "SELECT 1 AS value"],
    ["get"],
    ["close"],
  ]);
});

test("verifySqliteModule rejects an unexpected query result", () => {
  class InvalidDatabase {
    prepare() {
      return { get: () => ({ value: 0 }) };
    }

    close() {}
  }

  assert.throws(
    () => verifySqliteModule(InvalidDatabase),
    /better-sqlite3 smoke query returned an unexpected result/
  );
});

test("formatNativeModuleFailure includes runtime diagnostics and recovery steps", () => {
  const message = formatNativeModuleFailure(new Error("compiled for ABI 127"), {
    nodeVersion: "24.18.0",
    abi: "137",
  });

  assert.match(message, /node=24\.18\.0 abi=137/);
  assert.match(message, /compiled for ABI 127/);
  assert.match(message, /pnpm run clean/);
  assert.match(message, /mise exec -- pnpm install --frozen-lockfile/);
});
