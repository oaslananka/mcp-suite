import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import type { ToolCallRequest } from "../auth/KeyManager.js";
import {
  ApprovalStore,
  ApprovalTransitionError,
  type ApprovalDecision,
  type ApprovalEvent,
  type ApprovalRequest,
  type ApprovalStatus,
  type ApprovalStoreOptions,
} from "./ApprovalStore.js";

export interface ApprovalConfig {
  channels: string[];
  timeout: string;
  on_timeout?: "deny" | "approve";
  requesterPrincipalId?: string;
  approverPrincipalId?: string;
  upstreamExpiresAt?: Date;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ApprovalCapability {
  requestId: string;
  token: string;
  principalId: string;
  expiresAt: Date;
}

export interface ApprovalDispatch {
  request: ApprovalRequest;
  capability: ApprovalCapability;
}

export interface ApprovalChannelAdapter {
  name: string;
  publish(dispatch: ApprovalDispatch): Promise<void>;
  cancel?(request: ApprovalRequest): Promise<void>;
}

export interface ApprovalGateOptions extends ApprovalStoreOptions {
  adapters?: ApprovalChannelAdapter[];
  pollIntervalMs?: number;
  allowFailOpenTimeout?: boolean;
}

export interface ApprovalRequestResult {
  request: ApprovalRequest;
  capability?: ApprovalCapability;
}

const DEFAULT_APPROVER_PRINCIPAL = "sentinel-approver";
const DEFAULT_REQUESTER_PRINCIPAL = "anonymous";
const DEFAULT_POLL_INTERVAL_MS = 250;

export class ApprovalGate {
  private readonly adapters = new Map<string, ApprovalChannelAdapter>();
  private readonly allowFailOpenTimeout: boolean;
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly store: ApprovalStore;

  constructor(db: Database.Database = new Database(":memory:"), options: ApprovalGateOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = positiveInteger(
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      "pollIntervalMs"
    );
    this.allowFailOpenTimeout = options.allowFailOpenTimeout ?? false;
    this.store = new ApprovalStore(db, options);

    for (const adapter of options.adapters ?? []) {
      const name = adapter.name.trim();
      if (!name) {
        throw new Error("Approval adapter name must not be empty");
      }
      if (this.adapters.has(name)) {
        throw new Error(`Duplicate approval adapter: ${name}`);
      }
      this.adapters.set(name, adapter);
    }
  }

  async request(req: ToolCallRequest, config: ApprovalConfig): Promise<ApprovalRequestResult> {
    this.assertTimeoutPolicy(config);
    const timeoutMs = parseApprovalDuration(config.timeout);
    const createdAt = this.now();
    const rawCapability = `approval_${randomBytes(32).toString("hex")}`;
    const creation = this.store.createOrReuse(
      {
        requesterPrincipalId: config.requesterPrincipalId ?? DEFAULT_REQUESTER_PRINCIPAL,
        approverPrincipalId: config.approverPrincipalId ?? DEFAULT_APPROVER_PRINCIPAL,
        request: req,
        channels: config.channels,
        expiresAt: new Date(createdAt.getTime() + timeoutMs),
        ...(config.upstreamExpiresAt ? { upstreamExpiresAt: config.upstreamExpiresAt } : {}),
        ...(config.idempotencyKey ? { idempotencyKey: config.idempotencyKey } : {}),
      },
      rawCapability
    );

    if (!creation.capabilityIssued || creation.request.status !== "pending") {
      return { request: creation.request };
    }

    const capability: ApprovalCapability = {
      requestId: creation.request.id,
      token: rawCapability,
      principalId: creation.request.approverPrincipalId,
      expiresAt: creation.request.expiresAt,
    };
    const dispatch: ApprovalDispatch = { request: creation.request, capability };
    const publishedAdapters: ApprovalChannelAdapter[] = [];

    for (const channel of creation.request.channels) {
      const adapter = this.adapters.get(channel);
      if (!adapter) {
        this.store.recordDispatchFailure(
          creation.request.id,
          channel,
          "Approval channel adapter is not configured"
        );
        return this.cancelFailedDispatch(
          creation.request,
          publishedAdapters,
          `Approval channel adapter is not configured: ${channel}`
        );
      }

      try {
        await adapter.publish(dispatch);
        publishedAdapters.push(adapter);
        this.store.recordDispatch(creation.request.id, channel);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Approval channel dispatch failed";
        this.store.recordDispatchFailure(creation.request.id, channel, message);
        return this.cancelFailedDispatch(
          creation.request,
          publishedAdapters,
          `Approval channel dispatch failed: ${channel}`
        );
      }
    }

    return { request: creation.request, capability };
  }

  async hold(req: ToolCallRequest, config: ApprovalConfig): Promise<ApprovalStatus> {
    return (await this.holdRequest(req, config)).status;
  }

  async holdRequest(req: ToolCallRequest, config: ApprovalConfig): Promise<ApprovalRequest> {
    const requested = await this.request(req, config);
    if (requested.request.status !== "pending") {
      return requested.request;
    }

    const failOpen = config.on_timeout === "approve";
    while (true) {
      const nowMs = this.now().getTime();
      if (nowMs >= requested.request.expiresAt.getTime()) {
        return this.store.expire(requested.request.id, failOpen);
      }

      if (config.signal?.aborted) {
        return this.cancelAfterAbort(requested.request, config);
      }

      const current = this.store.get(requested.request.id, { expireDue: false });
      if (!current) {
        throw new ApprovalTransitionError(
          "request_not_found",
          "Approval request disappeared while waiting"
        );
      }
      if (current.status !== "pending") {
        return current;
      }

      const remainingMs = Math.max(1, requested.request.expiresAt.getTime() - nowMs);
      await delay(Math.min(this.pollIntervalMs, remainingMs), config.signal);
    }
  }

  claimExecution(requestId: string, principalId: string): boolean {
    return this.store.claimExecution(requestId, principalId);
  }

  decide(
    capability: string,
    principalId: string,
    decision: ApprovalDecision,
    reason?: string
  ): ApprovalRequest {
    return this.store.decide(capability, principalId, decision, reason);
  }

  cancel(requestId: string, principalId: string, reason?: string): ApprovalRequest {
    const request = this.store.cancel(requestId, principalId, reason);
    void this.cancelPublishedRequest(request);
    return request;
  }

  get(requestId: string): ApprovalRequest | undefined {
    return this.store.get(requestId);
  }

  list(status?: ApprovalStatus): ApprovalRequest[] {
    return this.store.list(status);
  }

  events(requestId: string): ApprovalEvent[] {
    return this.store.events(requestId);
  }

  private assertTimeoutPolicy(config: ApprovalConfig): void {
    if (config.on_timeout === "approve" && !this.allowFailOpenTimeout) {
      throw new Error(
        "Approval fail-open timeout is disabled; enable allowFailOpenTimeout explicitly"
      );
    }
  }

  private cancelFailedDispatch(
    request: ApprovalRequest,
    publishedAdapters: ApprovalChannelAdapter[],
    reason: string
  ): ApprovalRequestResult {
    const cancelled = this.store.cancel(request.id, request.requesterPrincipalId, reason);
    void Promise.allSettled(
      publishedAdapters.map((adapter) => adapter.cancel?.(cancelled) ?? Promise.resolve())
    );
    return { request: cancelled };
  }

  private cancelAfterAbort(request: ApprovalRequest, config: ApprovalConfig): ApprovalRequest {
    try {
      return this.cancel(
        request.id,
        config.requesterPrincipalId ?? request.requesterPrincipalId,
        "Approval wait was cancelled by the requester"
      );
    } catch (error: unknown) {
      if (error instanceof ApprovalTransitionError && error.code === "terminal_state") {
        return this.store.get(request.id) ?? request;
      }
      throw error;
    }
  }

  private async cancelPublishedRequest(request: ApprovalRequest): Promise<void> {
    await Promise.allSettled(
      request.channels.map((channel) => {
        const adapter = this.adapters.get(channel);
        return adapter?.cancel?.(request) ?? Promise.resolve();
      })
    );
  }
}

export function parseApprovalDuration(timeout: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(timeout.trim());
  if (!match) {
    throw new Error("Invalid approval timeout; expected a positive duration such as 30s or 5m");
  }

  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Approval timeout must be a positive safe integer");
  }

  const multiplier = durationMultiplier(match[2]);
  const duration = value * multiplier;
  if (!Number.isSafeInteger(duration)) {
    throw new TypeError("Approval timeout is too large");
  }
  return duration;
}

function durationMultiplier(unit: string | undefined): number {
  switch (unit) {
    case "ms":
      return 1;
    case "s":
      return 1_000;
    case "m":
      return 60_000;
    case "h":
      return 3_600_000;
    default:
      throw new TypeError("Approval timeout unit is invalid");
  }
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

async function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
    return;
  }
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
