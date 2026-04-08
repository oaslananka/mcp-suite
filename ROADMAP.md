# Roadmap — mcp-suite

Current release: **v1.0.0** (all packages at `@oaslananka/*@1.0.0`)

---

## v1.1.0 — Stability & Developer Experience

**sentinel**
- [ ] Policy hot-reload without restart
- [ ] GDPR right-to-erasure: purge audit log entries by session ID
- [ ] WebSocket transport support alongside stdio and HTTP

**composer**
- [ ] Health-aware routing: skip unhealthy backends automatically
- [ ] Per-backend timeout configuration
- [ ] Load balancing strategy: round-robin, least-connections

**forge**
- [ ] Visual pipeline editor (React Flow) — web UI for building pipelines without YAML
- [ ] Pipeline versioning: save and restore named pipeline snapshots
- [ ] Conditional branching: `if` / `else` nodes in pipeline DSL

**atlas**
- [ ] Federation: sync registry entries across multiple Atlas instances
- [ ] CLI `atlas search` — fuzzy search across all registered MCP servers
- [ ] Trust scoring: community-sourced ratings, download counts, CVE feed integration

**lab**
- [ ] Test suite integration (Playwright Electron)
- [ ] Request history with replay — re-send any past tool call with one click
- [ ] Load test runner built into the UI

## v1.2.0 — Observability & Intelligence

**observatory**
- [ ] Grafana dashboard export (pre-built JSON template)
- [ ] SLO breach alerting via webhook (Slack / PagerDuty / Teams)
- [ ] Cost attribution: per-tool, per-session, per-user token spend breakdown
- [ ] Anomaly alerting: notify when a metric exceeds learned baseline

**shared**
- [ ] OpenTelemetry propagation helpers (W3C trace context)
- [ ] Circuit breaker primitive reusable by all packages
- [ ] Retry budget: shared retry state to prevent thundering herd

**bridge**
- [ ] OpenAPI 3.1 full support (currently 3.0)
- [ ] GraphQL schema introspection → MCP tool generation
- [ ] gRPC reflection → MCP tool generation
- [ ] Live reload: detect spec file changes, regenerate tools without restart

## v1.3.0 — Multi-Tenant & Enterprise

**sentinel**
- [ ] RBAC: role-based policy with user/group bindings
- [ ] SOC 2 compatible audit log format (JSON Lines with required fields)
- [ ] mTLS support for transport-level identity verification
- [ ] Spend control: hard budget cap per user or per session

**composer**
- [ ] Multi-tenant namespacing: isolate backend visibility per tenant
- [ ] gRPC transport backend support

**atlas**
- [ ] Private registry: scoped visibility (org-only vs public)
- [ ] Signed package manifests (Sigstore / cosign)

## v2.0.0 — New Packages

- [ ] **@oaslananka/gateway** — HTTP-first multi-tenant MCP gateway with auth, rate limiting, and routing
- [ ] **@oaslananka/sdk** — Cross-language SDK surface starting with Python (mirrors the TypeScript shared package)
- [ ] **@oaslananka/cli** — Unified CLI: `oaslananka atlas search`, `oaslananka forge run`, `oaslananka sentinel policy`

## Won't Do

- Built-in vector database or embedding pipeline (use a dedicated tool)
- Cloud-hosted SaaS version of any package (self-hosted only)
- Support for MCP protocol versions older than 2025-03-26
