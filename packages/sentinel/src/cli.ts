#!/usr/bin/env node

import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import { Command } from "commander";
import { StdioTransport, logger } from "@oaslananka/shared";
import { ApprovalGate } from "./approval/ApprovalGate.js";
import type { ApprovalDecision, ApprovalStatus } from "./approval/ApprovalStore.js";
import { resolveAuditLogOptions } from "./audit/AuditConfig.js";
import { AuditLog } from "./audit/AuditLog.js";
import { KeyManager } from "./auth/KeyManager.js";
import { detectPII, redactPII } from "./pii/PIIDetector.js";
import { RequestPipeline } from "./proxy/RequestPipeline.js";
import { ResponsePipeline } from "./proxy/ResponsePipeline.js";
import { SentinelProxy } from "./proxy/SentinelProxy.js";

async function openDatabase(dbPath: string): Promise<Database.Database> {
  const absolutePath = path.resolve(dbPath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  return new Database(absolutePath);
}

function splitCsv(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean) ?? []
  );
}

function parseApprovalStatus(value: string): ApprovalStatus {
  if (["pending", "approved", "denied", "expired", "cancelled"].includes(value)) {
    return value as ApprovalStatus;
  }
  throw new Error("Approval status must be pending, approved, denied, expired, or cancelled");
}

function parseApprovalDecision(value: string): ApprovalDecision {
  if (value === "approved" || value === "denied") {
    return value;
  }
  throw new Error("Approval decision must be approved or denied");
}

async function readApprovalCapability(options: {
  capabilityEnv: string;
  capabilityFile?: string;
  capabilityStdin?: boolean;
}): Promise<string> {
  if (options.capabilityFile && options.capabilityStdin) {
    throw new Error("Choose only one capability source: file or stdin");
  }

  let capability: string | undefined;
  if (options.capabilityFile) {
    const filePath = path.resolve(options.capabilityFile);
    const metadata = await stat(filePath);
    if (!metadata.isFile()) {
      throw new Error("Approval capability path must be a regular file");
    }
    if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
      throw new Error("Approval capability file must not be accessible by group or other users");
    }
    capability = await readFile(filePath, "utf8");
  } else if (options.capabilityStdin) {
    process.stdin.setEncoding("utf8");
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input, "utf8") > 4096) {
        throw new Error("Approval capability input is too large");
      }
    }
    capability = input;
  } else {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.capabilityEnv)) {
      throw new Error("Capability environment variable name is invalid");
    }
    capability = process.env[options.capabilityEnv];
    delete process.env[options.capabilityEnv];
  }

  const normalized = capability?.trim();
  if (!normalized) {
    throw new Error(
      "Approval capability is required through --capability-file, --capability-stdin, or the configured environment variable"
    );
  }
  return normalized;
}

const program = new Command();

program.name("sentinel").description("Zero-Trust MCP security layer").version("1.0.0");

program
  .command("proxy")
  .description("Start the Sentinel MCP proxy over stdio")
  .option(
    "--db <path>",
    "SQLite database path",
    process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite"
  )
  .option(
    "--upstream-url <url>",
    "HTTP upstream MCP endpoint",
    process.env["SENTINEL_UPSTREAM_URL"]
  )
  .option(
    "--upstream-command <command>",
    "stdio upstream command",
    process.env["SENTINEL_UPSTREAM_COMMAND"]
  )
  .option(
    "--audit-retention-days <days>",
    "Audit retention in days (1-3650)",
    process.env["SENTINEL_AUDIT_RETENTION_DAYS"]
  )
  .option(
    "--audit-max-request-bytes <bytes>",
    "Maximum UTF-8 bytes stored for a redacted audit request",
    process.env["SENTINEL_AUDIT_MAX_REQUEST_BYTES"]
  )
  .option(
    "--audit-max-error-bytes <bytes>",
    "Maximum UTF-8 bytes stored for a redacted audit error",
    process.env["SENTINEL_AUDIT_MAX_ERROR_BYTES"]
  )
  .option(
    "--audit-fingerprint-secrets <boolean>",
    "Add non-reversible SHA-256 prefixes to redaction markers (true or false)",
    process.env["SENTINEL_AUDIT_FINGERPRINT_SECRETS"]
  )
  .option(
    "--approval-channel <channel...>",
    "Approval channel adapter names",
    splitCsv(process.env["SENTINEL_APPROVAL_CHANNELS"]).length > 0
      ? splitCsv(process.env["SENTINEL_APPROVAL_CHANNELS"])
      : ["default"]
  )
  .option(
    "--approval-timeout <duration>",
    "Approval expiry such as 30s or 5m",
    process.env["SENTINEL_APPROVAL_TIMEOUT"] ?? "5m"
  )
  .option(
    "--approval-approver <principal>",
    "Principal allowed to make the approval decision",
    process.env["SENTINEL_APPROVER_PRINCIPAL"] ?? "sentinel-approver"
  )
  .action(
    async (options: {
      db: string;
      upstreamUrl?: string;
      upstreamCommand?: string;
      auditRetentionDays?: string;
      auditMaxRequestBytes?: string;
      auditMaxErrorBytes?: string;
      auditFingerprintSecrets?: string | boolean;
      approvalChannel: string[];
      approvalTimeout: string;
      approvalApprover: string;
    }) => {
      if (!options.upstreamUrl && !options.upstreamCommand) {
        throw new Error("Either --upstream-url or --upstream-command is required.");
      }

      const auditOptions = resolveAuditLogOptions({
        retentionDays: options.auditRetentionDays,
        maxRequestBytes: options.auditMaxRequestBytes,
        maxErrorBytes: options.auditMaxErrorBytes,
        fingerprintSecrets: options.auditFingerprintSecrets,
      });
      const db = await openDatabase(options.db);
      const keyManager = new KeyManager(db);
      const proxy = new SentinelProxy(
        {
          ...(options.upstreamUrl ? { upstreamUrl: options.upstreamUrl } : {}),
          ...(options.upstreamCommand ? { upstreamCommand: options.upstreamCommand } : {}),
          approval: {
            channels: options.approvalChannel,
            timeout: options.approvalTimeout,
            approverPrincipalId: options.approvalApprover,
            onTimeout: "deny",
          },
        },
        new RequestPipeline(),
        new ResponsePipeline(),
        new AuditLog(db, auditOptions),
        new ApprovalGate(db),
        new StdioTransport(),
        keyManager
      );

      await proxy.start();
      logger.info(
        {
          auditRetentionDays: auditOptions.retentionDays,
          auditMaxRequestBytes: auditOptions.maxRequestBytes,
          auditMaxErrorBytes: auditOptions.maxErrorBytes,
          auditFingerprintSecrets: auditOptions.fingerprintSecrets,
          approvalChannels: options.approvalChannel,
          approvalTimeout: options.approvalTimeout,
          approvalApprover: options.approvalApprover,
        },
        "Sentinel proxy started on stdio transport"
      );
    }
  );

const keys = program.command("keys").description("Manage Sentinel virtual keys");

keys
  .command("create")
  .requiredOption("--name <name>", "Friendly name for the virtual key")
  .option("--tag <tag...>", "Tags to associate with the key")
  .option("--allow-tool <pattern...>", "Allowed tool glob patterns")
  .option("--rpm <number>", "Requests per minute rate limit")
  .option("--expires-at <timestamp>", "Optional ISO expiry timestamp")
  .option(
    "--db <path>",
    "SQLite database path",
    process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite"
  )
  .action(
    async (options: {
      name: string;
      tag?: string[];
      allowTool?: string[];
      rpm?: string;
      expiresAt?: string;
      db: string;
    }) => {
      const db = await openDatabase(options.db);
      const manager = new KeyManager(db);
      const key = manager.create({
        name: options.name,
        ...(options.tag ? { tags: options.tag } : {}),
        ...(options.allowTool ? { allowedTools: options.allowTool } : {}),
        ...(options.rpm ? { rateLimit: { requestsPerMinute: Number(options.rpm) } } : {}),
        ...(options.expiresAt ? { expiresAt: new Date(options.expiresAt) } : {}),
      });
      process.stdout.write(`${JSON.stringify(key, null, 2)}\n`);
    }
  );

keys
  .command("list")
  .option(
    "--db <path>",
    "SQLite database path",
    process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite"
  )
  .action(async (options: { db: string }) => {
    const db = await openDatabase(options.db);
    const manager = new KeyManager(db);
    process.stdout.write(`${JSON.stringify(manager.list(), null, 2)}\n`);
  });

keys
  .command("revoke")
  .argument("<id>", "Virtual key identifier")
  .option(
    "--db <path>",
    "SQLite database path",
    process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite"
  )
  .action(async (id: string, options: { db: string }) => {
    const db = await openDatabase(options.db);
    const manager = new KeyManager(db);
    manager.revoke(id);
    process.stdout.write(`Revoked key ${id}\n`);
  });

keys
  .command("rotate")
  .argument("<id>", "Virtual key identifier")
  .option(
    "--db <path>",
    "SQLite database path",
    process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite"
  )
  .action(async (id: string, options: { db: string }) => {
    const db = await openDatabase(options.db);
    const manager = new KeyManager(db);
    const rotated = manager.rotate(id);
    process.stdout.write(`${JSON.stringify(rotated, null, 2)}\n`);
  });

const approvals = program.command("approvals").description("Manage durable approval requests");

approvals
  .command("list")
  .option("--status <status>", "Filter by approval status")
  .option(
    "--db <path>",
    "SQLite database path",
    process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite"
  )
  .action(async (options: { status?: string; db: string }) => {
    const db = await openDatabase(options.db);
    try {
      const gate = new ApprovalGate(db);
      const status = options.status ? parseApprovalStatus(options.status) : undefined;
      process.stdout.write(`${JSON.stringify(gate.list(status), null, 2)}\n`);
    } finally {
      db.close();
    }
  });

approvals
  .command("show")
  .argument("<requestId>", "Approval request identifier")
  .option(
    "--db <path>",
    "SQLite database path",
    process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite"
  )
  .action(async (requestId: string, options: { db: string }) => {
    const db = await openDatabase(options.db);
    try {
      const request = new ApprovalGate(db).get(requestId);
      if (!request) {
        throw new Error(`Approval request "${requestId}" was not found`);
      }
      process.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
    } finally {
      db.close();
    }
  });

approvals
  .command("decide")
  .requiredOption("--principal <principal>", "Authenticated approver principal")
  .requiredOption("--decision <decision>", "approved or denied")
  .option("--reason <reason>", "Decision reason")
  .option("--capability-file <path>", "Read the one-use capability from a 0600 file")
  .option("--capability-stdin", "Read the one-use capability from stdin", false)
  .option(
    "--capability-env <name>",
    "Read the one-use capability from an environment variable",
    "SENTINEL_APPROVAL_CAPABILITY"
  )
  .option(
    "--db <path>",
    "SQLite database path",
    process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite"
  )
  .action(
    async (options: {
      principal: string;
      decision: string;
      reason?: string;
      capabilityFile?: string;
      capabilityStdin: boolean;
      capabilityEnv: string;
      db: string;
    }) => {
      const capability = await readApprovalCapability(options);
      const db = await openDatabase(options.db);
      try {
        const request = new ApprovalGate(db).decide(
          capability,
          options.principal,
          parseApprovalDecision(options.decision),
          options.reason
        );
        process.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
      } finally {
        db.close();
      }
    }
  );

approvals
  .command("cancel")
  .argument("<requestId>", "Approval request identifier")
  .requiredOption("--principal <principal>", "Requester or assigned approver principal")
  .option("--reason <reason>", "Cancellation reason")
  .option(
    "--db <path>",
    "SQLite database path",
    process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite"
  )
  .action(
    async (requestId: string, options: { principal: string; reason?: string; db: string }) => {
      const db = await openDatabase(options.db);
      try {
        const request = new ApprovalGate(db).cancel(requestId, options.principal, options.reason);
        process.stdout.write(`${JSON.stringify(request, null, 2)}\n`);
      } finally {
        db.close();
      }
    }
  );

approvals
  .command("events")
  .argument("<requestId>", "Approval request identifier")
  .option(
    "--db <path>",
    "SQLite database path",
    process.env["SENTINEL_DB_PATH"] ?? "./data/sentinel.sqlite"
  )
  .action(async (requestId: string, options: { db: string }) => {
    const db = await openDatabase(options.db);
    try {
      process.stdout.write(`${JSON.stringify(new ApprovalGate(db).events(requestId), null, 2)}\n`);
    } finally {
      db.close();
    }
  });

program
  .command("pii-scan")
  .description("Detect and optionally redact PII from input text")
  .argument("[text]", "Inline text to scan")
  .option("--file <path>", "Read text from a file instead of an inline argument")
  .option("--redact", "Emit redacted output as well", false)
  .action(async (text: string | undefined, options: { file?: string; redact: boolean }) => {
    const source = options.file ? await readFile(path.resolve(options.file), "utf8") : (text ?? "");
    const matches = detectPII(source);
    const result = {
      matches,
      redacted: options.redact ? redactPII(source) : undefined,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error({ err: error }, "Sentinel CLI failed");
  process.exitCode = 1;
});
