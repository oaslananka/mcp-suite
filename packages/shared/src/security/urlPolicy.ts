import { lookup as defaultLookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface DnsAddress {
  address: string;
  family: number;
}

export interface UrlPolicyOptions {
  allowedHosts?: string[];
  label?: string;
  lookup?: (hostname: string) => Promise<DnsAddress[] | DnsAddress>;
  requireHttps?: boolean;
  resolveDns?: boolean;
}

export interface PublicHttpUrlResolution {
  url: URL;
  hostname: string;
  addresses: DnsAddress[];
}

export class UrlPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlPolicyError";
  }
}

export async function assertPublicHttpUrl(
  input: string | URL,
  options: UrlPolicyOptions = {}
): Promise<URL> {
  return (await resolvePublicHttpUrl(input, options)).url;
}

export async function resolvePublicHttpUrl(
  input: string | URL,
  options: UrlPolicyOptions = {}
): Promise<PublicHttpUrlResolution> {
  const label = options.label ?? "HTTP URL policy";
  const url = input instanceof URL ? input : new URL(input);
  const requireHttps = options.requireHttps ?? true;

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UrlPolicyError(`${label}: only HTTP and HTTPS URLs are allowed`);
  }

  if (requireHttps && url.protocol !== "https:") {
    throw new UrlPolicyError(`${label}: HTTPS is required`);
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    throw new UrlPolicyError(`${label}: URL host is required`);
  }

  if (options.allowedHosts && options.allowedHosts.length > 0) {
    const allowed = new Set(options.allowedHosts.map((host) => normalizeHostname(host)));
    if (!allowed.has(hostname)) {
      throw new UrlPolicyError(`${label}: host "${hostname}" is not in the allowed host policy`);
    }
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UrlPolicyError(`${label}: localhost targets are not allowed`);
  }

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    assertPublicIpAddress(hostname, label);
    return { url, hostname, addresses: [{ address: hostname, family: literalFamily }] };
  }

  if (options.resolveDns === false) {
    return { url, hostname, addresses: [] };
  }

  const resolver = options.lookup ?? defaultDnsLookup;
  const resolved = await resolver(hostname);
  const addresses = Array.isArray(resolved) ? resolved : [resolved];
  if (addresses.length === 0) {
    throw new UrlPolicyError(`${label}: host "${hostname}" did not resolve`);
  }

  for (const entry of addresses) {
    assertPublicIpAddress(entry.address, label);
  }

  return { url, hostname, addresses };
}

export function assertPublicIpAddress(address: string, label = "HTTP URL policy"): void {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);

  if (family === 4) {
    const octets = normalized.split(".").map((part) => Number(part));
    if (
      octets.length !== 4 ||
      octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
      throw new UrlPolicyError(`${label}: invalid IPv4 address`);
    }

    const [first = 0, second = 0] = octets;
    const blocked =
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224;

    if (blocked) {
      throw new UrlPolicyError(
        `${label}: private, loopback, link-local, multicast, or reserved IPv4 targets are not allowed`
      );
    }
    return;
  }

  if (family === 6) {
    const lower = normalized.toLowerCase();
    const mappedPrefix = "::ffff:";
    if (lower.startsWith(mappedPrefix)) {
      assertPublicIpAddress(lower.slice(mappedPrefix.length), label);
      return;
    }

    const firstHextet = lower.split(":").find((part) => part.length > 0) ?? "0";
    const firstValue = Number.parseInt(firstHextet, 16);
    const blocked =
      lower === "::" ||
      lower === "::1" ||
      (firstValue >= 0xfc00 && firstValue <= 0xfdff) ||
      (firstValue >= 0xfe80 && firstValue <= 0xfebf) ||
      (firstValue >= 0xff00 && firstValue <= 0xffff);

    if (blocked) {
      throw new UrlPolicyError(
        `${label}: private, loopback, link-local, multicast, or unspecified IPv6 targets are not allowed`
      );
    }
    return;
  }

  throw new UrlPolicyError(`${label}: resolved address "${address}" is not a valid IP address`);
}

function normalizeHostname(hostname: string): string {
  return (
    hostname.trim().replace(/^\[/, "").replace(/\]$/, "").split("%", 1)[0]?.toLowerCase() ?? ""
  );
}

async function defaultDnsLookup(hostname: string): Promise<DnsAddress[]> {
  return defaultLookup(hostname, { all: true, verbatim: true });
}
