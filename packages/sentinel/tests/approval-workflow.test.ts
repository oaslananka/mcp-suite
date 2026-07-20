import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApprovalGate,
  parseApprovalDuration,
  type ApprovalChannelAdapter,
  type ApprovalDispatch,
} from "../src/approval/ApprovalGate.js";
import {
  ApprovalStore,
  ApprovalTransitionError,
  type CreateApprovalRequest,
} from "../src/approval/ApprovalStore.js";

const temporaryDirectories: string[] = [];

function createDatabaseFile(): { db: Database.Database; directory: string; file: string } {
  const directory = mkdtempSync(path.join(tmpdir(), "sentinel-approval-"));
  temporaryDirectories.push(directory);
  const file = path.join(directory, "sentinel.sqlite");
  return { db: new Database(file), directory, file };
}

function requestInput(
  now: Date,
  overrides: Partial<CreateApprovalRequest> = {}
): CreateApprovalRequest {
  return {
    requesterPrincipalId: "requester-1",
    approverPrincipalId: "approver-1",
    request: {
      tool: "github__delete_repository",
      input: {
        repository: "example/repo",
        apiKey: "input-secret",
        note: "Authorization: Bearer free-text-secret",
      },
      headers: { authorization: "Bearer header-secret" },
    },
    channels: ["cli"],
    expiresAt: new Date(now.getTime() + 60_000),
    idempotencyKey: "request-1",
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ApprovalStore", () => {
  it("persists redacted requests, hashes capabilities, and recovers pending state after restart", () => {
    const now = new Date("2026-07-20T20:00:00.000Z");
    const { db, file } = createDatabaseFile();
    const store = new ApprovalStore(db, { now: () => now });
    const rawCapability = "approval_raw_capability_must_not_persist";

    const created = store.createOrReuse(requestInput(now), rawCapability);
    expect(created.capabilityIssued).toBe(true);
    expect(created.request).toMatchObject({
      status: "pending",
      requesterPrincipalId: "requester-1",
      approverPrincipalId: "approver-1",
    });

    const stored = db
      .prepare(
        "SELECT request_json, capability_hash FROM approval_requests JOIN approval_capabilities ON approval_requests.id = approval_capabilities.request_id"
      )
      .get() as { request_json: string; capability_hash: string };
    expect(stored.request_json).not.toContain("header-secret");
    expect(stored.request_json).not.toContain("input-secret");
    expect(stored.request_json).not.toContain("free-text-secret");
    expect(stored.request_json).toContain("[REDACTED]");
    expect(stored.capability_hash).not.toContain(rawCapability);
    expect(JSON.stringify(db.prepare("SELECT * FROM approval_capabilities").all())).not.toContain(
      rawCapability
    );
    db.close();

    const restartedDb = new Database(file);
    const restarted = new ApprovalStore(restartedDb, { now: () => now });
    expect(restarted.get(created.request.id)).toMatchObject({ status: "pending" });
    expect(restarted.list("pending")).toHaveLength(1);
    restartedDb.close();
  });

  it("atomically approves once and keeps an immutable attributed audit trail", () => {
    const now = new Date("2026-07-20T20:00:00.000Z");
    const { db } = createDatabaseFile();
    const store = new ApprovalStore(db, { now: () => now });
    const capability = "approval_once";
    const created = store.createOrReuse(requestInput(now), capability);

    const approved = store.decide(capability, "approver-1", "approved", "Reviewed change");
    expect(approved).toMatchObject({
      status: "approved",
      decidedBy: "approver-1",
      reason: "Reviewed change",
    });
    expect(store.claimExecution(created.request.id, "other-requester")).toBe(false);
    expect(store.claimExecution(created.request.id, "requester-1")).toBe(true);
    expect(store.claimExecution(created.request.id, "requester-1")).toBe(false);
    expect(store.get(created.request.id)).toMatchObject({
      executionClaimedBy: "requester-1",
    });

    expect(() => store.decide(capability, "approver-1", "approved", "again")).toThrowError(
      expect.objectContaining<Partial<ApprovalTransitionError>>({ code: "capability_used" })
    );
    expect(() => store.decide("missing", "approver-1", "approved")).toThrowError(
      expect.objectContaining<Partial<ApprovalTransitionError>>({ code: "invalid_capability" })
    );
    expect(store.events(created.request.id).map((event) => event.type)).toEqual([
      "created",
      "capability_issued",
      "approved",
      "execution_claimed",
    ]);
    expect(
      store.events(created.request.id).find((event) => event.type === "approved")
    ).toMatchObject({
      actorPrincipalId: "approver-1",
      reason: "Reviewed change",
    });

    expect(() => db.prepare("UPDATE approval_events SET reason = 'tampered'").run()).toThrow(
      /immutable/i
    );
    expect(() => db.prepare("DELETE FROM approval_events").run()).toThrow(/immutable/i);
    db.close();
  });

  it("reuses one pending request and one capability for duplicate idempotency keys", () => {
    const now = new Date("2026-07-20T20:00:00.000Z");
    const { db } = createDatabaseFile();
    const store = new ApprovalStore(db, { now: () => now });
    const first = store.createOrReuse(requestInput(now), "approval_first");
    const duplicate = store.createOrReuse(requestInput(now), "approval_duplicate");

    expect(first.capabilityIssued).toBe(true);
    expect(duplicate).toMatchObject({
      capabilityIssued: false,
      request: { id: first.request.id, status: "pending" },
    });
    expect(
      (db.prepare("SELECT COUNT(*) AS count FROM approval_capabilities").get() as { count: number })
        .count
    ).toBe(1);

    expect(() =>
      store.createOrReuse(
        requestInput(now, {
          request: { tool: "different", input: {}, headers: {} },
        }),
        "approval_mismatch"
      )
    ).toThrow(/different approval request/i);

    const otherRequester = store.createOrReuse(
      requestInput(now, { requesterPrincipalId: "requester-2" }),
      "approval_other_requester"
    );
    expect(otherRequester.request.id).not.toBe(first.request.id);
    db.close();
  });

  it("rejects the wrong principal and supports deny, cancel, expiry, and idempotent reuse", () => {
    let now = new Date("2026-07-20T20:00:00.000Z");
    const { db } = createDatabaseFile();
    const store = new ApprovalStore(db, { now: () => now });

    const deniedCapability = "approval_deny";
    const denied = store.createOrReuse(
      requestInput(now, { idempotencyKey: "deny-request" }),
      deniedCapability
    );
    expect(() => store.decide(deniedCapability, "other-approver", "denied")).toThrowError(
      expect.objectContaining<Partial<ApprovalTransitionError>>({ code: "principal_mismatch" })
    );
    expect(store.decide(deniedCapability, "approver-1", "denied", "Too risky")).toMatchObject({
      status: "denied",
      reason: "Too risky",
    });

    const cancelled = store.createOrReuse(
      requestInput(now, { idempotencyKey: "cancel-request" }),
      "approval_cancel"
    );
    expect(store.cancel(cancelled.request.id, "requester-1", "Client disconnected")).toMatchObject({
      status: "cancelled",
      decidedBy: "requester-1",
    });
    expect(() => store.cancel(cancelled.request.id, "requester-1", "again")).toThrowError(
      expect.objectContaining<Partial<ApprovalTransitionError>>({ code: "terminal_state" })
    );

    const expiring = store.createOrReuse(
      requestInput(now, {
        idempotencyKey: "expire-request",
        expiresAt: new Date(now.getTime() + 100),
      }),
      "approval_expire"
    );
    now = new Date(now.getTime() + 101);
    expect(store.get(expiring.request.id)).toMatchObject({ status: "expired" });
    expect(() => store.decide("approval_expire", "approver-1", "approved")).toThrowError(
      expect.objectContaining<Partial<ApprovalTransitionError>>({ code: "capability_expired" })
    );

    now = new Date(now.getTime() + 1_000);
    const reused = store.createOrReuse(
      requestInput(now, { idempotencyKey: "deny-request" }),
      "new-capability"
    );
    expect(reused).toMatchObject({ capabilityIssued: false, request: { status: "denied" } });
    db.close();
  });
});

describe("ApprovalGate", () => {
  it("dispatches a sanitized one-use capability and waits for an authenticated approval", async () => {
    const db = new Database(":memory:");
    const dispatches: ApprovalDispatch[] = [];
    const adapter: ApprovalChannelAdapter = {
      name: "cli",
      async publish(dispatch) {
        dispatches.push(dispatch);
      },
    };
    const gate = new ApprovalGate(db, { adapters: [adapter], pollIntervalMs: 5 });
    const hold = gate.hold(
      {
        tool: "github__delete_repository",
        input: { apiKey: "secret", repository: "example/repo" },
        headers: { authorization: "Bearer secret" },
      },
      {
        channels: ["cli"],
        timeout: "1s",
        requesterPrincipalId: "requester-1",
        approverPrincipalId: "approver-1",
        idempotencyKey: "gate-approve",
      }
    );

    await waitUntil(() => dispatches.length === 1);
    expect(dispatches[0]?.request.request).toMatchObject({
      input: { apiKey: "[REDACTED]", repository: "example/repo" },
      headers: { authorization: "[REDACTED]" },
    });
    expect(dispatches[0]?.capability.token).not.toBe("");
    expect(dispatches[0]?.capability.principalId).toBe("approver-1");

    gate.decide(dispatches[0]!.capability.token, "approver-1", "approved", "Reviewed in CLI");
    await expect(hold).resolves.toBe("approved");
    expect(gate.events(dispatches[0]!.request.id).at(-1)).toMatchObject({
      type: "approved",
      actorPrincipalId: "approver-1",
      reason: "Reviewed in CLI",
    });
    db.close();
  });

  it("returns denied, cancelled, and expired terminal states without fail-open behavior", async () => {
    const db = new Database(":memory:");
    const dispatches: ApprovalDispatch[] = [];
    const adapter: ApprovalChannelAdapter = {
      name: "cli",
      async publish(dispatch) {
        dispatches.push(dispatch);
      },
    };
    const gate = new ApprovalGate(db, { adapters: [adapter], pollIntervalMs: 5 });

    const deniedHold = gate.hold(
      { tool: "danger", input: {}, headers: {} },
      {
        channels: ["cli"],
        timeout: "1s",
        requesterPrincipalId: "requester",
        approverPrincipalId: "approver",
        idempotencyKey: "gate-deny",
      }
    );
    await waitUntil(() => dispatches.length === 1);
    gate.decide(dispatches[0]!.capability.token, "approver", "denied", "No");
    await expect(deniedHold).resolves.toBe("denied");

    const cancelledHold = gate.hold(
      { tool: "danger", input: {}, headers: {} },
      {
        channels: ["cli"],
        timeout: "1s",
        requesterPrincipalId: "requester",
        approverPrincipalId: "approver",
        idempotencyKey: "gate-cancel",
      }
    );
    await waitUntil(() => dispatches.length === 2);
    gate.cancel(dispatches[1]!.request.id, "requester", "Client disconnected");
    await expect(cancelledHold).resolves.toBe("cancelled");

    await expect(
      gate.hold(
        { tool: "danger", input: {}, headers: {} },
        {
          channels: ["cli"],
          timeout: "25ms",
          requesterPrincipalId: "requester",
          approverPrincipalId: "approver",
          idempotencyKey: "gate-expire",
        }
      )
    ).resolves.toBe("expired");
    expect(gate.list("expired")).toHaveLength(1);
    db.close();
  });

  it("fails closed when adapters are missing or fail and rejects implicit fail-open timeout", async () => {
    const db = new Database(":memory:");
    const gate = new ApprovalGate(db, { pollIntervalMs: 5 });
    await expect(
      gate.hold(
        { tool: "danger", input: {}, headers: {} },
        {
          channels: ["missing"],
          timeout: "1s",
          requesterPrincipalId: "requester",
          approverPrincipalId: "approver",
          idempotencyKey: "missing-adapter",
        }
      )
    ).resolves.toBe("cancelled");

    const failing = new ApprovalGate(db, {
      adapters: [
        {
          name: "webhook",
          async publish() {
            throw new Error("provider unavailable Authorization: Bearer provider-secret");
          },
        },
      ],
      pollIntervalMs: 5,
    });
    await expect(
      failing.hold(
        { tool: "danger", input: {}, headers: {} },
        {
          channels: ["webhook"],
          timeout: "1s",
          requesterPrincipalId: "requester",
          approverPrincipalId: "approver",
          idempotencyKey: "failing-adapter",
        }
      )
    ).resolves.toBe("cancelled");
    expect(JSON.stringify(failing.events(failing.list("cancelled")[0]!.id))).not.toContain(
      "provider-secret"
    );

    await expect(
      gate.hold(
        { tool: "danger", input: {}, headers: {} },
        {
          channels: ["missing"],
          timeout: "100ms",
          on_timeout: "approve",
          requesterPrincipalId: "requester",
          approverPrincipalId: "approver",
        }
      )
    ).rejects.toThrow(/fail-open timeout is disabled/i);
    db.close();
  });

  it("supports explicit fail-open policy, upstream expiry, and restart decisions", async () => {
    const { db, file } = createDatabaseFile();
    const dispatches: ApprovalDispatch[] = [];
    const adapter: ApprovalChannelAdapter = {
      name: "cli",
      async publish(dispatch) {
        dispatches.push(dispatch);
      },
    };
    const failOpenGate = new ApprovalGate(db, {
      adapters: [adapter],
      allowFailOpenTimeout: true,
      pollIntervalMs: 5,
    });
    await expect(
      failOpenGate.hold(
        { tool: "danger", input: {}, headers: {} },
        {
          channels: ["cli"],
          timeout: "100ms",
          on_timeout: "approve",
          requesterPrincipalId: "requester",
          approverPrincipalId: "approver",
          idempotencyKey: "explicit-fail-open",
        }
      )
    ).resolves.toBe("approved");

    const upstreamStart = Date.now();
    await expect(
      failOpenGate.hold(
        { tool: "danger", input: {}, headers: {} },
        {
          channels: ["cli"],
          timeout: "1s",
          upstreamExpiresAt: new Date(upstreamStart + 100),
          requesterPrincipalId: "requester",
          approverPrincipalId: "approver",
          idempotencyKey: "upstream-expiry",
        }
      )
    ).resolves.toBe("expired");
    expect(Date.now() - upstreamStart).toBeLessThan(1_000);

    const pending = await failOpenGate.request(
      { tool: "danger", input: {}, headers: {} },
      {
        channels: ["cli"],
        timeout: "1s",
        requesterPrincipalId: "requester",
        approverPrincipalId: "approver",
        idempotencyKey: "restart-request",
      }
    );
    db.close();

    const restartedDb = new Database(file);
    const restarted = new ApprovalGate(restartedDb, { adapters: [adapter], pollIntervalMs: 5 });
    expect(restarted.get(pending.request.id)).toMatchObject({ status: "pending" });
    restarted.decide(pending.capability!.token, "approver", "approved", "Restarted operator");
    expect(restarted.get(pending.request.id)).toMatchObject({ status: "approved" });
    restartedDb.close();
  });

  it("parses strict approval durations", () => {
    expect(parseApprovalDuration("5ms")).toBe(5);
    expect(parseApprovalDuration("1s")).toBe(1_000);
    expect(parseApprovalDuration("2m")).toBe(120_000);
    expect(parseApprovalDuration("1h")).toBe(3_600_000);
    expect(() => parseApprovalDuration("nonsense")).toThrow(/invalid approval timeout/i);
    expect(() => parseApprovalDuration("0s")).toThrow(/positive/i);
  });
});

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Condition was not reached before timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
