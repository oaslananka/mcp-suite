import { createHash } from "node:crypto";
import type { ToolCallRequest } from "../auth/KeyManager.js";
import { redactPII } from "../pii/PIIDetector.js";

export const DEFAULT_AUDIT_RETENTION_DAYS = 30;
export const DEFAULT_AUDIT_MAX_REQUEST_BYTES = 64 * 1024;
export const DEFAULT_AUDIT_MAX_ERROR_BYTES = 4 * 1024;
export const DEFAULT_AUDIT_MAX_DEPTH = 20;
export const MIN_AUDIT_REQUEST_BYTES = 256;
export const MAX_AUDIT_REQUEST_BYTES = 1024 * 1024;
export const MIN_AUDIT_ERROR_BYTES = 64;
export const MAX_AUDIT_ERROR_BYTES = 64 * 1024;

export interface AuditRedactionOptions {
  fingerprintSecrets?: boolean;
  maxRequestBytes?: number;
  maxErrorBytes?: number;
  maxDepth?: number;
}

export interface SanitizedAuditRequest {
  request: ToolCallRequest;
  serialized: string;
  truncated: boolean;
}

interface ResolvedAuditRedactionOptions {
  fingerprintSecrets: boolean;
  maxRequestBytes: number;
  maxErrorBytes: number;
  maxDepth: number;
}

const SENSITIVE_KEY_NAMES = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "apikey",
  "xapikey",
  "password",
  "passwd",
  "credential",
  "credentials",
  "privatekey",
  "sessionid",
  "clientsecret",
]);

const SECRET_SUFFIXES = ["token", "secret", "password", "passwd", "credential", "credentials"];
const TRUNCATION_MARKER = "\n[TRUNCATED]";

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    SENSITIVE_KEY_NAMES.has(normalized) ||
    SECRET_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

function assertIntegerInRange(
  value: number,
  label: string,
  minimum: number,
  maximum: number
): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function truncateUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }

  const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, "utf8");
  const budget = Math.max(0, maxBytes - markerBytes);
  let truncated = Buffer.from(value, "utf8").subarray(0, budget).toString("utf8");
  while (truncated.endsWith("\uFFFD")) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}${TRUNCATION_MARKER}`;
}

function fingerprintSource(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return String(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol" ||
    typeof value === "function"
  ) {
    return `${typeof value}:${String(value)}`;
  }

  const seen = new WeakSet<object>();
  try {
    const serialized = JSON.stringify(value, (_key, nested: unknown) => {
      if (nested && typeof nested === "object") {
        if (seen.has(nested)) {
          return "[CIRCULAR]";
        }
        seen.add(nested);
      }
      return nested;
    });
    return serialized ?? Object.prototype.toString.call(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

export class AuditRedactor {
  private readonly options: ResolvedAuditRedactionOptions;

  constructor(options: AuditRedactionOptions = {}) {
    this.options = {
      fingerprintSecrets: options.fingerprintSecrets ?? false,
      maxRequestBytes: assertIntegerInRange(
        options.maxRequestBytes ?? DEFAULT_AUDIT_MAX_REQUEST_BYTES,
        "maxRequestBytes",
        MIN_AUDIT_REQUEST_BYTES,
        MAX_AUDIT_REQUEST_BYTES
      ),
      maxErrorBytes: assertIntegerInRange(
        options.maxErrorBytes ?? DEFAULT_AUDIT_MAX_ERROR_BYTES,
        "maxErrorBytes",
        MIN_AUDIT_ERROR_BYTES,
        MAX_AUDIT_ERROR_BYTES
      ),
      maxDepth: assertIntegerInRange(
        options.maxDepth ?? DEFAULT_AUDIT_MAX_DEPTH,
        "maxDepth",
        1,
        100
      ),
    };
  }

  sanitizeRequest(request: ToolCallRequest): SanitizedAuditRequest {
    const sanitized: ToolCallRequest = {
      tool: this.sanitizeText(request.tool),
      headers: Object.fromEntries(
        Object.entries(request.headers).map(([name, value]) => [
          name,
          isSensitiveKey(name) ? this.secretMarker(value) : this.sanitizeText(value),
        ])
      ),
      input: this.sanitizeObject(request.input),
    };

    const serialized = JSON.stringify(sanitized);
    if (Buffer.byteLength(serialized, "utf8") <= this.options.maxRequestBytes) {
      return { request: sanitized, serialized, truncated: false };
    }

    const auditMessage = `[TRUNCATED] redacted request exceeded ${this.options.maxRequestBytes} UTF-8 bytes`;
    let toolBudget = Math.min(128, this.options.maxRequestBytes);

    while (toolBudget >= 0) {
      const summary: ToolCallRequest = {
        tool: toolBudget === 0 ? "" : truncateUtf8(sanitized.tool, toolBudget),
        headers: {},
        input: { _audit: auditMessage },
      };
      const summaryJson = JSON.stringify(summary);
      if (Buffer.byteLength(summaryJson, "utf8") <= this.options.maxRequestBytes) {
        return { request: summary, serialized: summaryJson, truncated: true };
      }
      if (toolBudget === 0) {
        break;
      }
      toolBudget = Math.floor(toolBudget / 2);
    }

    throw new Error("maxRequestBytes is too small for the audit truncation summary");
  }

  sanitizeError(error: string | undefined): string | undefined {
    if (error === undefined) {
      return undefined;
    }
    return truncateUtf8(this.sanitizeText(error), this.options.maxErrorBytes);
  }

  private sanitizeObject(value: Record<string, unknown>): Record<string, unknown> {
    const sanitized = this.sanitizeValue(value, 0, new WeakSet<object>());
    if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
      return { _audit: "[INVALID_INPUT]" };
    }
    return sanitized as Record<string, unknown>;
  }

  private sanitizeValue(value: unknown, depth: number, ancestors: WeakSet<object>): unknown {
    if (typeof value === "string") {
      return this.sanitizeText(value);
    }
    if (
      value === null ||
      value === undefined ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "symbol" || typeof value === "function") {
      return "[UNSERIALIZABLE]";
    }
    if (depth >= this.options.maxDepth) {
      return "[MAX_DEPTH]";
    }
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? "[INVALID_DATE]" : value.toISOString();
    }
    if (ancestors.has(value)) {
      return "[CIRCULAR]";
    }

    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        return value.map((item) => this.sanitizeValue(item, depth + 1, ancestors));
      }

      let entries: Array<[string, unknown]>;
      try {
        entries = Object.entries(value);
      } catch {
        return "[UNSERIALIZABLE]";
      }

      return Object.fromEntries(
        entries.map(([key, nested]) => [
          key,
          isSensitiveKey(key)
            ? this.secretMarker(nested)
            : this.sanitizeValue(nested, depth + 1, ancestors),
        ])
      );
    } finally {
      ancestors.delete(value);
    }
  }

  private sanitizeText(value: string): string {
    let sanitized = redactPII(value);

    sanitized = sanitized.replace(
      /\bauthorization\s*[:=]\s*(?:bearer\s+)?([^\s,;]+)/gi,
      (_match, secret: string) => `Authorization: ${this.secretMarker(secret)}`
    );
    sanitized = sanitized.replace(
      /\bbearer\s+([A-Za-z0-9._~+/=-]+)/gi,
      (_match, secret: string) => `Bearer ${this.secretMarker(secret)}`
    );
    sanitized = sanitized.replace(
      /\beyJ[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      (secret) => this.secretMarker(secret)
    );
    sanitized = sanitized.replace(/\bmcp_[a-fA-F0-9]{32,}\b/g, (secret) =>
      this.secretMarker(secret)
    );
    sanitized = sanitized.replace(
      /\b(?:github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9]+)\b/g,
      (secret) => this.secretMarker(secret)
    );
    sanitized = sanitized.replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|password|client[_-]?secret)\s*[:=]\s*([^\s,;]+)/gi,
      (_match, key: string, secret: string) => `${key}=${this.secretMarker(secret)}`
    );

    return sanitized;
  }

  private secretMarker(value: unknown): string {
    if (!this.options.fingerprintSecrets) {
      return "[REDACTED]";
    }

    const digest = createHash("sha256").update(fingerprintSource(value)).digest("hex").slice(0, 12);
    return `[REDACTED sha256:${digest}]`;
  }
}
