# Remote Schema Fetch Security Implementation Plan

- [x] Add failing tests for special-use IPv4/IPv6 ranges, URL credentials, mixed DNS answers, and exact trusted-host opt-in.
- [x] Implement shared URL classification with fail-closed DNS validation.
- [x] Add failing tests for DNS pinning, rebinding, redirects, timeouts, request/response limits, content types, and credential forwarding.
- [x] Implement shared pinned safe-fetch utility.
- [x] Replace Forge's duplicated HTTP security implementation with the shared utility.
- [x] Route Bridge remote OpenAPI parsing through the shared utility.
- [x] Add exact trusted-private-host CLI and environment configuration.
- [x] Document the default-deny remote schema policy and private-network exception.
- [x] Run full uncached monorepo CI and security validation.
- [x] Push the branch and open a PR linked to issue #37.
- [ ] Review all bot and agent findings, resolve actionable comments, and merge after required checks pass.
