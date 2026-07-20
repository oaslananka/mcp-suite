# Remote Schema Fetch Security Design

## Goal

Protect Bridge remote OpenAPI loading and Forge workflow HTTP calls from SSRF, DNS rebinding, redirect abuse, credential forwarding, and unbounded response consumption through one shared outbound-request boundary.

## Boundary

`@oaslananka/shared` owns URL classification, DNS resolution, address validation, connection pinning, redirect handling, timeout enforcement, content-type policy, and byte limits. Bridge and Forge supply product-specific policy values but do not implement their own network security checks.

## Address policy

HTTPS is the default. URL credentials and localhost are rejected. IPv4 and IPv6 loopback, private, link-local, multicast, unspecified, documentation, benchmarking, transition, and other special-use ranges are blocked. Every DNS answer must pass; mixed public/private answers fail closed. The selected reviewed address is supplied through the HTTP agent lookup callback, preventing a second resolver result from changing the destination.

## Redirect and credential policy

Redirects are manual, capped, and revalidated with a new DNS resolution. Sensitive headers are removed across origins. POST requests converted by 301, 302, or 303 use GET without a request body. Cross-origin 307/308 responses cannot forward a request body.

## Resource policy

The same deadline covers connection and body consumption. Request and response byte ceilings are enforced, including streaming bodies. Bridge accepts only explicit OpenAPI JSON/YAML media types and defaults to a 1 MB response ceiling.

## Private-network opt-in

Bridge accepts exact trusted hostnames or IP literals through CLI or environment configuration. Wildcards, URLs, paths, credentials, and ports are invalid. The exception permits private address resolution only for the exact host and does not bypass HTTPS, address pinning, redirects, timeouts, or response limits.
