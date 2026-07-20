# Durable Human Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Sentinel's timer placeholder with a durable, authenticated, restart-safe approval workflow that fails closed.

**Architecture:** Store approval requests, hashed one-use capabilities, and immutable transition events in the existing Sentinel SQLite database. `ApprovalGate` orchestrates adapters and waits for terminal state while `ApprovalStore` owns atomic state transitions; `SentinelProxy` resumes the upstream tool call only after an approved terminal state.

**Tech Stack:** TypeScript, Node.js 24, better-sqlite3, Vitest, existing AuditRedactor.

## Global Constraints

- Persist only redacted request metadata; never persist raw capability tokens.
- Default timeout behavior is expiry/deny; fail-open timeout requires an explicit constructor option.
- Every state transition is atomic and append-only audited.
- Existing terminal states cannot transition or execute twice.
- Adapters receive capabilities through a provider-neutral interface.

---

### Task 1: Durable approval store

**Files:**

- Create: `packages/sentinel/src/approval/ApprovalStore.ts`
- Test: `packages/sentinel/tests/approval-workflow.test.ts`

**Interfaces:**

- Produces: `ApprovalStore.createOrReuse`, `decide`, `cancel`, `expire`, `get`, `list`, and `events`.

- [ ] Write failing persistence, immutable-event, duplicate, expiry, cancellation, and restart tests.
- [ ] Run the focused test and verify the missing store failure.
- [ ] Implement SQLite schema, sanitized request persistence, hashed capabilities, and atomic transitions.
- [ ] Run focused tests and commit the durable store.

### Task 2: Approval gate and adapters

**Files:**

- Modify: `packages/sentinel/src/approval/ApprovalGate.ts`
- Test: `packages/sentinel/tests/approval-workflow.test.ts`
- Modify: `packages/sentinel/tests/approval-gate-duration.test.ts`

**Interfaces:**

- Consumes: `ApprovalStore`.
- Produces: `ApprovalChannelAdapter`, `ApprovalGate.request`, `hold`, `decide`, `cancel`, `list`, and `events`.

- [ ] Add failing approve, deny, expire, adapter failure, capability principal, and restart polling tests.
- [ ] Implement strict duration parsing, effective upstream expiry, adapter dispatch, wait/poll, and fail-closed timeout.
- [ ] Run focused tests and commit orchestration.

### Task 3: Proxy and CLI integration

**Files:**

- Modify: `packages/sentinel/src/proxy/SentinelProxy.ts`
- Modify: `packages/sentinel/src/cli.ts`
- Modify: `packages/sentinel/src/index.ts`
- Modify: `packages/sentinel/tests/approval-audit-proxy.test.ts`
- Modify: `packages/sentinel/tests/sentinel-proxy-edges.test.ts`
- Modify: `packages/sentinel/README.md`
- Modify: `.env.example`

**Interfaces:**

- Consumes: `ApprovalGate` terminal statuses and authenticated decision API.
- Produces: durable proxy gating and `sentinel approvals` operator commands.

- [ ] Add failing end-to-end test proving one approval causes exactly one upstream execution.
- [ ] Wire requester identity, configured approver/channels, idempotency header, and fail-closed result handling.
- [ ] Add list/decide/cancel/events CLI commands using the same SQLite database.
- [ ] Document capability handling, restart recovery, and provider adapter integration.
- [ ] Run Sentinel package and repository gates, then commit.
