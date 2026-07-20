#!/usr/bin/env node

import { createRequire } from "node:module";

import { formatNativeModuleFailure, verifySqliteModule } from "./native-module-check.mjs";

const require = createRequire(import.meta.url);

try {
  const Database = require("better-sqlite3");
  verifySqliteModule(Database);
  console.log(
    `Native module ABI OK: better-sqlite3 node=${process.version.replace(/^v/, "")} abi=${process.versions.modules}`
  );
} catch (error) {
  console.error(formatNativeModuleFailure(error));
  process.exit(1);
}
