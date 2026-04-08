const checks = [
  { name: "forge", url: process.env.FORGE_HEALTH_URL ?? "http://127.0.0.1:4000/health" },
  { name: "atlas", url: process.env.ATLAS_HEALTH_URL ?? "http://127.0.0.1:4003/health" },
  { name: "observatory", url: process.env.OBSERVATORY_HEALTH_URL ?? "http://127.0.0.1:4006/health" },
];

if (process.env.SENTINEL_HEALTH_URL) {
  checks.push({ name: "sentinel", url: process.env.SENTINEL_HEALTH_URL });
}

for (const check of checks) {
  const response = await fetch(check.url, {
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Health check failed for ${check.name}: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload.status !== "ok") {
    throw new Error(`Health check returned non-ok payload for ${check.name}: ${JSON.stringify(payload)}`);
  }
}

console.log(`Production smoke checks passed for ${checks.map((check) => check.name).join(", ")}.`);
