import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { AuditRedactor, type AuditRedactionOptions } from "../audit/AuditRedactor.js";
import type { ToolCallRequest } from "../auth/KeyManager.js";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "cancelled";
export type ApprovalDecision = "approved" | "denied";
export type ApprovalEventType =
  | "created"
  | "capability_issued"
  | "dispatched"
  | "dispatch_failed"
  | "approved"
  | "denied"
  | "expired"
  | "cancelled"
  | "execution_claimed";

export interface CreateApprovalRequest {
  requesterPrincipalId: string;
  approverPrincipalId: string;
  request: ToolCallRequest;
  channels: string[];
  expiresAt: Date;
  upstreamExpiresAt?: Date;
  idempotencyKey?: string;
}

export interface ApprovalRequest {
  id: string;
  requesterPrincipalId: string;
  approverPrincipalId: string;
  request: ToolCallRequest;
  channels: string[];
  status: ApprovalStatus;
  createdAt: Date;
  expiresAt: Date;
  upstreamExpiresAt?: Date;
  idempotencyKey?: string;
  decidedAt?: Date;
  decidedBy?: string;
  reason?: string;
  executionClaimedAt?: Date;
  executionClaimedBy?: string;
}

export interface ApprovalEvent {
  id: number;
  requestId: string;
  type: ApprovalEventType;
  status: ApprovalStatus;
  actorPrincipalId?: string;
  reason?: string;
  createdAt: Date;
}

export interface ApprovalCreationResult {
  request: ApprovalRequest;
  capabilityIssued: boolean;
}

export interface ApprovalStoreOptions extends AuditRedactionOptions {
  now?: () => Date;
}

export type ApprovalTransitionErrorCode =
  | "invalid_capability"
  | "capability_used"
  | "capability_expired"
  | "principal_mismatch"
  | "request_not_found"
  | "terminal_state"
  | "invalid_request";

export class ApprovalTransitionError extends Error {
  constructor(
    readonly code: ApprovalTransitionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApprovalTransitionError";
  }
}

interface StoredRequestRow extends Record<string, unknown> {
  id: string;
  idempotency_key: string | null;
  request_fingerprint: string | null;
  requester_principal_id: string;
  approver_principal_id: string;
  tool_name: string;
  request_json: string;
  channels_json: string;
  status: ApprovalStatus;
  created_at: string;
  expires_at: string;
  upstream_expires_at: string | null;
  decided_at: string | null;
  decided_by: string | null;
  reason: string | null;
  execution_claimed_at: string | null;
  execution_claimed_by: string | null;
}

interface StoredCapabilityRow extends Record<string, unknown> {
  capability_hash: string;
  request_id: string;
  principal_id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

interface StoredEventRow extends Record<string, unknown> {
  id: number;
  request_id: string;
  event_type: ApprovalEventType;
  status: ApprovalStatus;
  actor_principal_id: string | null;
  reason: string | null;
  created_at: string;
}

interface DecisionTransactionResult {
  request: ApprovalRequest;
  error?: ApprovalTransitionError;
}

const TERMINAL_STATUSES = new Set<ApprovalStatus>(["approved", "denied", "expired", "cancelled"]);

export class ApprovalStore {
  private readonly now: () => Date;
  private readonly redactor: AuditRedactor;

  constructor(
    private readonly db: Database.Database,
    options: ApprovalStoreOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.redactor = new AuditRedactor(options);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("secure_delete = ON");
    this.initializeSchema();
    this.expireDue();
  }

  createOrReuse(input: CreateApprovalRequest, rawCapability: string): ApprovalCreationResult {
    const normalized = this.normalizeCreateInput(input);
    const sanitized = this.redactor.sanitizeRequest(normalized.request);
    const scopedIdempotencyKey = normalized.idempotencyKey
      ? hashIdempotencyKey(normalized.requesterPrincipalId, normalized.idempotencyKey)
      : undefined;
    const requestFingerprint = hashApprovalRequest({
      requesterPrincipalId: normalized.requesterPrincipalId,
      approverPrincipalId: normalized.approverPrincipalId,
      request: sanitized.request,
      channels: normalized.channels,
      ...(normalized.upstreamExpiresAt ? { upstreamExpiresAt: normalized.upstreamExpiresAt } : {}),
    });
    const capabilityHash = hashCapability(rawCapability);
    const transaction = this.db.transaction((): ApprovalCreationResult => {
      if (scopedIdempotencyKey) {
        const existing = this.selectByIdempotencyKey(scopedIdempotencyKey);
        if (existing) {
          if (existing.request_fingerprint !== requestFingerprint) {
            throw new ApprovalTransitionError(
              "invalid_request",
              "Idempotency key was already used for a different approval request"
            );
          }
          const request = this.expireRowIfDue(existing, this.now());
          return { request, capabilityIssued: false };
        }
      }

      const now = this.now();
      const id = randomUUID();
      this.db
        .prepare(
          `
          INSERT INTO approval_requests (
            id, idempotency_key, request_fingerprint,
            requester_principal_id, approver_principal_id,
            tool_name, request_json, channels_json, status, created_at, expires_at,
            upstream_expires_at, decided_at, decided_by, reason,
            execution_claimed_at, execution_claimed_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL, NULL, NULL, NULL, NULL)
        `
        )
        .run(
          id,
          scopedIdempotencyKey ?? null,
          requestFingerprint,
          normalized.requesterPrincipalId,
          normalized.approverPrincipalId,
          sanitized.request.tool,
          sanitized.serialized,
          JSON.stringify(normalized.channels),
          now.toISOString(),
          normalized.expiresAt.toISOString(),
          normalized.upstreamExpiresAt?.toISOString() ?? null
        );
      this.insertEvent(id, "created", "pending", normalized.requesterPrincipalId);
      this.insertCapability(
        id,
        normalized.approverPrincipalId,
        capabilityHash,
        normalized.expiresAt
      );
      this.insertEvent(id, "capability_issued", "pending");
      return { request: this.requireRequest(id), capabilityIssued: true };
    });

    return transaction();
  }

  recordDispatch(requestId: string, channel: string): void {
    const request = this.requirePending(requestId, false);
    this.insertEvent(request.id, "dispatched", request.status, undefined, channel);
  }

  recordDispatchFailure(requestId: string, channel: string, reason: string): void {
    const request = this.requirePending(requestId, false);
    this.insertEvent(
      request.id,
      "dispatch_failed",
      request.status,
      undefined,
      `${channel}: ${this.redactor.sanitizeError(reason) ?? "dispatch failed"}`
    );
  }

  decide(
    rawCapability: string,
    principalId: string,
    decision: ApprovalDecision,
    reason?: string
  ): ApprovalRequest {
    const now = this.now();
    const capabilityHash = hashCapability(rawCapability);
    const transaction = this.db.transaction((): DecisionTransactionResult => {
      const capability = this.db
        .prepare("SELECT * FROM approval_capabilities WHERE capability_hash = ? LIMIT 1")
        .get(capabilityHash) as StoredCapabilityRow | undefined;
      if (!capability) {
        throw new ApprovalTransitionError("invalid_capability", "Approval capability is invalid");
      }

      const requestRow = this.selectRequest(capability.request_id);
      if (!requestRow) {
        throw new ApprovalTransitionError("request_not_found", "Approval request was not found");
      }
      let request = this.expireRowIfDue(requestRow, now);

      if (capability.used_at) {
        return {
          request,
          error: new ApprovalTransitionError(
            "capability_used",
            "Approval capability has already been used"
          ),
        };
      }
      if (capability.principal_id !== principalId) {
        return {
          request,
          error: new ApprovalTransitionError(
            "principal_mismatch",
            "Approval capability is not assigned to this principal"
          ),
        };
      }
      if (new Date(capability.expires_at).getTime() <= now.getTime()) {
        return {
          request,
          error: new ApprovalTransitionError(
            "capability_expired",
            "Approval capability has expired"
          ),
        };
      }
      if (request.status !== "pending") {
        return {
          request,
          error: new ApprovalTransitionError(
            "terminal_state",
            `Approval request is already ${request.status}`
          ),
        };
      }

      const sanitizedReason = this.redactor.sanitizeError(reason);
      const updated = this.db
        .prepare(
          `
          UPDATE approval_requests
          SET status = ?, decided_at = ?, decided_by = ?, reason = ?
          WHERE id = ? AND status = 'pending'
        `
        )
        .run(decision, now.toISOString(), principalId, sanitizedReason ?? null, request.id);
      if (updated.changes !== 1) {
        request = this.requireRequest(request.id);
        return {
          request,
          error: new ApprovalTransitionError(
            "terminal_state",
            `Approval request is already ${request.status}`
          ),
        };
      }

      this.db
        .prepare("UPDATE approval_capabilities SET used_at = ? WHERE capability_hash = ?")
        .run(now.toISOString(), capabilityHash);
      this.insertEvent(request.id, decision, decision, principalId, sanitizedReason);
      return { request: this.requireRequest(request.id) };
    });

    const result = transaction();
    if (result.error) {
      throw result.error;
    }
    return result.request;
  }

  claimExecution(requestId: string, principalId: string): boolean {
    const actor = normalizeIdentifier(principalId, "executionPrincipalId");
    const now = this.now();
    const transaction = this.db.transaction((): boolean => {
      const row = this.selectRequest(requestId);
      if (!row) {
        throw new ApprovalTransitionError("request_not_found", "Approval request was not found");
      }
      const request = this.expireRowIfDue(row, now);
      if (request.status !== "approved" || request.requesterPrincipalId !== actor) {
        return false;
      }

      const result = this.db
        .prepare(
          `
          UPDATE approval_requests
          SET execution_claimed_at = ?, execution_claimed_by = ?
          WHERE id = ? AND status = 'approved' AND execution_claimed_at IS NULL
        `
        )
        .run(now.toISOString(), actor, requestId);
      if (result.changes !== 1) {
        return false;
      }
      this.insertEvent(requestId, "execution_claimed", "approved", actor);
      return true;
    });
    return transaction();
  }

  cancel(requestId: string, principalId: string, reason?: string): ApprovalRequest {
    const now = this.now();
    const transaction = this.db.transaction((): DecisionTransactionResult => {
      const row = this.selectRequest(requestId);
      if (!row) {
        throw new ApprovalTransitionError("request_not_found", "Approval request was not found");
      }
      const request = this.expireRowIfDue(row, now);
      if (request.status !== "pending") {
        return {
          request,
          error: new ApprovalTransitionError(
            "terminal_state",
            `Approval request is already ${request.status}`
          ),
        };
      }
      if (
        principalId !== request.requesterPrincipalId &&
        principalId !== request.approverPrincipalId
      ) {
        return {
          request,
          error: new ApprovalTransitionError(
            "principal_mismatch",
            "Only the requester or assigned approver can cancel this request"
          ),
        };
      }

      const sanitizedReason = this.redactor.sanitizeError(reason);
      this.transitionPending(
        request.id,
        "cancelled",
        now,
        principalId,
        sanitizedReason,
        "cancelled"
      );
      return { request: this.requireRequest(request.id) };
    });

    const result = transaction();
    if (result.error) {
      throw result.error;
    }
    return result.request;
  }

  expire(requestId: string, failOpen = false): ApprovalRequest {
    const now = this.now();
    const transaction = this.db.transaction((): ApprovalRequest => {
      const row = this.selectRequest(requestId);
      if (!row) {
        throw new ApprovalTransitionError("request_not_found", "Approval request was not found");
      }
      const request = this.toRequest(row);
      if (request.status !== "pending") {
        return request;
      }
      const targetStatus: ApprovalStatus = failOpen ? "approved" : "expired";
      this.transitionPending(
        request.id,
        targetStatus,
        now,
        "system:timeout",
        failOpen ? "Approved by explicit fail-open timeout policy" : "Approval request expired",
        targetStatus === "approved" ? "approved" : "expired"
      );
      return this.requireRequest(request.id);
    });
    return transaction();
  }

  get(requestId: string, options: { expireDue?: boolean } = {}): ApprovalRequest | undefined {
    if (options.expireDue ?? true) {
      this.expireDue();
    }
    const row = this.selectRequest(requestId);
    return row ? this.toRequest(row) : undefined;
  }

  list(status?: ApprovalStatus): ApprovalRequest[] {
    this.expireDue();
    const rows = status
      ? (this.db
          .prepare("SELECT * FROM approval_requests WHERE status = ? ORDER BY created_at DESC")
          .all(status) as StoredRequestRow[])
      : (this.db
          .prepare("SELECT * FROM approval_requests ORDER BY created_at DESC")
          .all() as StoredRequestRow[]);
    return rows.map((row) => this.toRequest(row));
  }

  events(requestId: string): ApprovalEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM approval_events WHERE request_id = ? ORDER BY id ASC")
      .all(requestId) as StoredEventRow[];
    return rows.map((row) => ({
      id: Number(row.id),
      requestId: row.request_id,
      type: row.event_type,
      status: row.status,
      ...(row.actor_principal_id ? { actorPrincipalId: row.actor_principal_id } : {}),
      ...(row.reason ? { reason: row.reason } : {}),
      createdAt: new Date(row.created_at),
    }));
  }

  expireDue(): number {
    const now = this.now();
    const due = this.db
      .prepare("SELECT id FROM approval_requests WHERE status = 'pending' AND expires_at <= ?")
      .all(now.toISOString()) as Array<{ id: string }>;
    if (due.length === 0) {
      return 0;
    }

    const transaction = this.db.transaction(() => {
      let changed = 0;
      for (const entry of due) {
        changed += this.transitionPending(
          entry.id,
          "expired",
          now,
          "system:timeout",
          "Approval request expired",
          "expired"
        );
      }
      return changed;
    });
    return transaction();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT UNIQUE,
        request_fingerprint TEXT NOT NULL,
        requester_principal_id TEXT NOT NULL,
        approver_principal_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        request_json TEXT NOT NULL,
        channels_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','approved','denied','expired','cancelled')),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        upstream_expires_at TEXT,
        decided_at TEXT,
        decided_by TEXT,
        reason TEXT,
        execution_claimed_at TEXT,
        execution_claimed_by TEXT
      );

      CREATE TABLE IF NOT EXISTS approval_capabilities (
        capability_hash TEXT PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
        principal_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS approval_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL REFERENCES approval_requests(id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        actor_principal_id TEXT,
        reason TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_approval_requests_status_expiry
        ON approval_requests(status, expires_at);
      CREATE INDEX IF NOT EXISTS idx_approval_events_request
        ON approval_events(request_id, id);

      CREATE TRIGGER IF NOT EXISTS approval_events_immutable_update
      BEFORE UPDATE ON approval_events
      BEGIN
        SELECT RAISE(ABORT, 'approval events are immutable');
      END;

      CREATE TRIGGER IF NOT EXISTS approval_events_immutable_delete
      BEFORE DELETE ON approval_events
      BEGIN
        SELECT RAISE(ABORT, 'approval events are immutable');
      END;
    `);
    this.ensureRequestColumn("request_fingerprint", "TEXT");
    this.ensureRequestColumn("execution_claimed_at", "TEXT");
    this.ensureRequestColumn("execution_claimed_by", "TEXT");
  }

  private ensureRequestColumn(name: string, definition: string): void {
    const columns = this.db.prepare("PRAGMA table_info(approval_requests)").all() as Array<{
      name: string;
    }>;
    if (!columns.some((column) => column.name === name)) {
      this.db.exec(`ALTER TABLE approval_requests ADD COLUMN ${name} ${definition}`);
    }
  }

  private normalizeCreateInput(input: CreateApprovalRequest): CreateApprovalRequest {
    const requesterPrincipalId = normalizeIdentifier(
      input.requesterPrincipalId,
      "requesterPrincipalId"
    );
    const approverPrincipalId = normalizeIdentifier(
      input.approverPrincipalId,
      "approverPrincipalId"
    );
    const channels = [...new Set(input.channels.map((channel) => channel.trim()).filter(Boolean))];
    if (channels.length === 0) {
      throw new ApprovalTransitionError(
        "invalid_request",
        "At least one approval channel is required"
      );
    }
    if (!isValidDate(input.expiresAt) || input.expiresAt.getTime() <= this.now().getTime()) {
      throw new ApprovalTransitionError(
        "invalid_request",
        "Approval expiry must be a future timestamp"
      );
    }
    if (input.upstreamExpiresAt && !isValidDate(input.upstreamExpiresAt)) {
      throw new ApprovalTransitionError("invalid_request", "Upstream expiry is invalid");
    }
    const effectiveExpiresAt = input.upstreamExpiresAt
      ? new Date(Math.min(input.expiresAt.getTime(), input.upstreamExpiresAt.getTime()))
      : input.expiresAt;
    if (effectiveExpiresAt.getTime() <= this.now().getTime()) {
      throw new ApprovalTransitionError(
        "invalid_request",
        "Approval request is already expired upstream"
      );
    }

    return {
      requesterPrincipalId,
      approverPrincipalId,
      request: input.request,
      channels,
      expiresAt: effectiveExpiresAt,
      ...(input.upstreamExpiresAt ? { upstreamExpiresAt: input.upstreamExpiresAt } : {}),
      ...(input.idempotencyKey
        ? { idempotencyKey: normalizeIdentifier(input.idempotencyKey, "idempotencyKey", 512) }
        : {}),
    };
  }

  private insertCapability(
    requestId: string,
    principalId: string,
    capabilityHash: string,
    expiresAt: Date
  ): void {
    this.db
      .prepare(
        `
        INSERT INTO approval_capabilities (
          capability_hash, request_id, principal_id, created_at, expires_at, used_at
        ) VALUES (?, ?, ?, ?, ?, NULL)
      `
      )
      .run(
        capabilityHash,
        requestId,
        principalId,
        this.now().toISOString(),
        expiresAt.toISOString()
      );
  }

  private insertEvent(
    requestId: string,
    type: ApprovalEventType,
    status: ApprovalStatus,
    actorPrincipalId?: string,
    reason?: string
  ): void {
    this.db
      .prepare(
        `
        INSERT INTO approval_events (
          request_id, event_type, status, actor_principal_id, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        requestId,
        type,
        status,
        actorPrincipalId ?? null,
        reason ?? null,
        this.now().toISOString()
      );
  }

  private transitionPending(
    requestId: string,
    status: ApprovalStatus,
    decidedAt: Date,
    actorPrincipalId: string,
    reason: string | undefined,
    eventType: ApprovalEventType
  ): number {
    if (!TERMINAL_STATUSES.has(status)) {
      throw new Error(`Invalid terminal approval status: ${status}`);
    }
    const result = this.db
      .prepare(
        `
        UPDATE approval_requests
        SET status = ?, decided_at = ?, decided_by = ?, reason = ?
        WHERE id = ? AND status = 'pending'
      `
      )
      .run(status, decidedAt.toISOString(), actorPrincipalId, reason ?? null, requestId);
    if (result.changes === 1) {
      this.insertEvent(requestId, eventType, status, actorPrincipalId, reason);
    }
    return result.changes;
  }

  private expireRowIfDue(row: StoredRequestRow, now: Date): ApprovalRequest {
    const request = this.toRequest(row);
    if (request.status === "pending" && request.expiresAt.getTime() <= now.getTime()) {
      this.transitionPending(
        request.id,
        "expired",
        now,
        "system:timeout",
        "Approval request expired",
        "expired"
      );
      return this.requireRequest(request.id);
    }
    return request;
  }

  private requirePending(requestId: string, expireDue = true): ApprovalRequest {
    const row = this.selectRequest(requestId);
    if (!row) {
      throw new ApprovalTransitionError("request_not_found", "Approval request was not found");
    }
    const request = expireDue ? this.expireRowIfDue(row, this.now()) : this.toRequest(row);
    if (request.status !== "pending") {
      throw new ApprovalTransitionError(
        "terminal_state",
        `Approval request is already ${request.status}`
      );
    }
    return request;
  }

  private requireRequest(requestId: string): ApprovalRequest {
    const row = this.selectRequest(requestId);
    if (!row) {
      throw new ApprovalTransitionError("request_not_found", "Approval request was not found");
    }
    return this.toRequest(row);
  }

  private selectRequest(requestId: string): StoredRequestRow | undefined {
    return this.db
      .prepare("SELECT * FROM approval_requests WHERE id = ? LIMIT 1")
      .get(requestId) as StoredRequestRow | undefined;
  }

  private selectByIdempotencyKey(idempotencyKey: string): StoredRequestRow | undefined {
    return this.db
      .prepare("SELECT * FROM approval_requests WHERE idempotency_key = ? LIMIT 1")
      .get(idempotencyKey) as StoredRequestRow | undefined;
  }

  private toRequest(row: StoredRequestRow): ApprovalRequest {
    let parsed: ToolCallRequest;
    try {
      parsed = JSON.parse(row.request_json) as ToolCallRequest;
    } catch {
      parsed = {
        tool: row.tool_name,
        input: { _approval: "[INVALID_STORED_REQUEST]" },
        headers: {},
      };
    }
    const request = this.redactor.sanitizeRequest(parsed).request;
    const channels = safeStringArray(row.channels_json);
    const upstreamExpiresAt = row.upstream_expires_at
      ? new Date(row.upstream_expires_at)
      : undefined;
    const decidedAt = row.decided_at ? new Date(row.decided_at) : undefined;
    const executionClaimedAt = row.execution_claimed_at
      ? new Date(row.execution_claimed_at)
      : undefined;

    return {
      id: row.id,
      requesterPrincipalId: row.requester_principal_id,
      approverPrincipalId: row.approver_principal_id,
      request,
      channels,
      status: row.status,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      ...(upstreamExpiresAt ? { upstreamExpiresAt } : {}),
      ...(row.idempotency_key ? { idempotencyKey: row.idempotency_key } : {}),
      ...(decidedAt ? { decidedAt } : {}),
      ...(row.decided_by ? { decidedBy: row.decided_by } : {}),
      ...(row.reason ? { reason: row.reason } : {}),
      ...(executionClaimedAt ? { executionClaimedAt } : {}),
      ...(row.execution_claimed_by ? { executionClaimedBy: row.execution_claimed_by } : {}),
    };
  }
}

interface ApprovalFingerprintInput {
  requesterPrincipalId: string;
  approverPrincipalId: string;
  request: ToolCallRequest;
  channels: string[];
  upstreamExpiresAt?: Date;
}

function hashIdempotencyKey(requesterPrincipalId: string, rawKey: string): string {
  return createHash("sha256")
    .update(requesterPrincipalId)
    .update("\0")
    .update(rawKey)
    .digest("hex");
}

function hashApprovalRequest(input: ApprovalFingerprintInput): string {
  return createHash("sha256")
    .update(
      stableJson({
        requesterPrincipalId: input.requesterPrincipalId,
        approverPrincipalId: input.approverPrincipalId,
        request: input.request,
        channels: [...input.channels].sort((left, right) => left.localeCompare(right)),
        upstreamExpiresAt: input.upstreamExpiresAt?.toISOString() ?? null,
      })
    )
    .digest("hex");
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

function hashCapability(rawCapability: string): string {
  if (rawCapability.length < 8) {
    throw new ApprovalTransitionError("invalid_capability", "Approval capability is malformed");
  }
  return createHash("sha256").update(rawCapability).digest("hex");
}

function normalizeIdentifier(value: string, label: string, maximum = 200): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new ApprovalTransitionError(
      "invalid_request",
      `${label} must contain between 1 and ${maximum} characters`
    );
  }
  return normalized;
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function safeStringArray(serialized: string): string[] {
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}
