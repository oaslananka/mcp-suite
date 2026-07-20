import { isIP } from "node:net";

export function resolveTrustedPrivateHosts(
  explicitHosts?: string[],
  environmentValue?: string
): string[] {
  const values =
    explicitHosts && explicitHosts.length > 0
      ? explicitHosts
      : (environmentValue?.split(",") ?? []);
  const normalized = values
    .map((value) => normalizeExactHost(value))
    .filter((value): value is string => Boolean(value));
  return [...new Set(normalized)];
}

function normalizeExactHost(value: string): string {
  const candidate = value.trim().toLowerCase();
  if (!candidate) {
    return "";
  }
  if (
    candidate.includes("*") ||
    candidate.includes("/") ||
    candidate.includes("@") ||
    candidate.includes("://")
  ) {
    throw new Error("Trusted private host must be an exact hostname or IP literal");
  }

  const bracketed = candidate.match(/^\[([^\]]+)\]$/);
  if (bracketed) {
    const address = bracketed[1];
    if (!address || isIP(address) !== 6) {
      throw new Error("Trusted private host must be an exact hostname or IP literal");
    }
    return address;
  }

  if (isIP(candidate) !== 0) {
    return candidate;
  }
  if (candidate.includes(":")) {
    throw new Error("Trusted private host must be an exact hostname or IP literal");
  }

  const hostname = candidate.replace(/\.$/, "");
  if (
    hostname.length > 253 ||
    !hostname.split(".").every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))
  ) {
    throw new Error("Trusted private host must be an exact hostname or IP literal");
  }
  return hostname;
}
