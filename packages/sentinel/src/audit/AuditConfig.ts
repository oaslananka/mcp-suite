import {
  MAX_AUDIT_RETENTION_DAYS,
  MIN_AUDIT_RETENTION_DAYS,
  type AuditLogOptions,
} from "./AuditLog.js";
import {
  DEFAULT_AUDIT_MAX_ERROR_BYTES,
  DEFAULT_AUDIT_MAX_REQUEST_BYTES,
  DEFAULT_AUDIT_RETENTION_DAYS,
  MAX_AUDIT_ERROR_BYTES,
  MAX_AUDIT_REQUEST_BYTES,
  MIN_AUDIT_ERROR_BYTES,
  MIN_AUDIT_REQUEST_BYTES,
} from "./AuditRedactor.js";

export interface AuditLogOptionInput {
  retentionDays?: string | number | undefined;
  maxRequestBytes?: string | number | undefined;
  maxErrorBytes?: string | number | undefined;
  fingerprintSecrets?: string | boolean | undefined;
}

export interface ResolvedAuditLogOptions extends Required<
  Pick<
    AuditLogOptions,
    "retentionDays" | "maxRequestBytes" | "maxErrorBytes" | "fingerprintSecrets"
  >
> {}

function parseInteger(
  value: string | number | undefined,
  fallback: number,
  label: string,
  minimum: number,
  maximum: number
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function parseBoolean(value: string | boolean | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error("fingerprintSecrets must be true or false");
}

export function resolveAuditLogOptions(input: AuditLogOptionInput): ResolvedAuditLogOptions {
  return {
    retentionDays: parseInteger(
      input.retentionDays,
      DEFAULT_AUDIT_RETENTION_DAYS,
      "retentionDays",
      MIN_AUDIT_RETENTION_DAYS,
      MAX_AUDIT_RETENTION_DAYS
    ),
    maxRequestBytes: parseInteger(
      input.maxRequestBytes,
      DEFAULT_AUDIT_MAX_REQUEST_BYTES,
      "maxRequestBytes",
      MIN_AUDIT_REQUEST_BYTES,
      MAX_AUDIT_REQUEST_BYTES
    ),
    maxErrorBytes: parseInteger(
      input.maxErrorBytes,
      DEFAULT_AUDIT_MAX_ERROR_BYTES,
      "maxErrorBytes",
      MIN_AUDIT_ERROR_BYTES,
      MAX_AUDIT_ERROR_BYTES
    ),
    fingerprintSecrets: parseBoolean(input.fingerprintSecrets, false),
  };
}
