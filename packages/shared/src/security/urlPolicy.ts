import { lookup as defaultLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

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
  trustedPrivateHosts?: string[];
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

function ipv4Network(a: number, b: number, c: number, d: number): string {
  return `${a}.${b}.${c}.${d}`;
}

function ipv6Network(...groups: string[]): string {
  return groups.join(":");
}

const BLOCKED_IPV4 = new BlockList();
for (const [network, prefix] of [
  [ipv4Network(0, 0, 0, 0), 8],
  [ipv4Network(10, 0, 0, 0), 8],
  [ipv4Network(100, 64, 0, 0), 10],
  [ipv4Network(127, 0, 0, 0), 8],
  [ipv4Network(169, 254, 0, 0), 16],
  [ipv4Network(172, 16, 0, 0), 12],
  [ipv4Network(192, 0, 0, 0), 24],
  [ipv4Network(192, 0, 2, 0), 24],
  [ipv4Network(192, 168, 0, 0), 16],
  [ipv4Network(198, 18, 0, 0), 15],
  [ipv4Network(198, 51, 100, 0), 24],
  [ipv4Network(203, 0, 113, 0), 24],
  [ipv4Network(224, 0, 0, 0), 4],
  [ipv4Network(240, 0, 0, 0), 4],
] as const) {
  BLOCKED_IPV4.addSubnet(network, prefix, "ipv4");
}

const BLOCKED_IPV6 = new BlockList();
for (const [network, prefix] of [
  [ipv6Network("", "", ""), 128],
  [ipv6Network("", "", "1"), 128],
  [ipv6Network("64", "ff9b", "", ""), 96],
  [ipv6Network("64", "ff9b", "1", "", ""), 48],
  [ipv6Network("100", "", ""), 64],
  [ipv6Network("2001", "", ""), 23],
  [ipv6Network("2001", "db8", "", ""), 32],
  [ipv6Network("2002", "", ""), 16],
  [ipv6Network("3fff", "", ""), 20],
  [ipv6Network("5f00", "", ""), 16],
  [ipv6Network("fc00", "", ""), 7],
  [ipv6Network("fe80", "", ""), 10],
  [ipv6Network("ff00", "", ""), 8],
] as const) {
  BLOCKED_IPV6.addSubnet(network, prefix, "ipv6");
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
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  } catch {
    throw new UrlPolicyError(`${label}: invalid URL`);
  }
  const requireHttps = options.requireHttps ?? true;

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UrlPolicyError(`${label}: only HTTP and HTTPS URLs are allowed`);
  }

  if (requireHttps && url.protocol !== "https:") {
    throw new UrlPolicyError(`${label}: HTTPS is required`);
  }

  if (url.username || url.password) {
    throw new UrlPolicyError(`${label}: URL credentials are not allowed`);
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname) {
    throw new UrlPolicyError(`${label}: URL host is required`);
  }

  if (options.allowedHosts && options.allowedHosts.length > 0) {
    const allowed = new Set(options.allowedHosts.map((host) => normalizeHostname(host)));
    if (!allowed.has(hostname)) {
      throw new UrlPolicyError(`${label}: target host is not in the allowed host policy`);
    }
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UrlPolicyError(`${label}: localhost targets are not allowed`);
  }

  const trustedPrivateHosts = new Set(
    (options.trustedPrivateHosts ?? []).map((host) => normalizeHostname(host))
  );
  const privateNetworkTrusted = trustedPrivateHosts.has(hostname);

  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    const address = normalizeAndValidateAddress(hostname, label, privateNetworkTrusted);
    return { url, hostname, addresses: [address] };
  }

  if (options.resolveDns === false) {
    return { url, hostname, addresses: [] };
  }

  const resolver = options.lookup ?? defaultDnsLookup;
  let resolved: DnsAddress[] | DnsAddress;
  try {
    resolved = await resolver(hostname);
  } catch {
    throw new UrlPolicyError(`${label}: target host could not be resolved`);
  }

  const rawAddresses = Array.isArray(resolved) ? resolved : [resolved];
  if (rawAddresses.length === 0) {
    throw new UrlPolicyError(`${label}: target host did not resolve`);
  }

  const addresses: DnsAddress[] = [];
  const seen = new Set<string>();
  for (const entry of rawAddresses) {
    const address = normalizeAndValidateAddress(entry.address, label, privateNetworkTrusted);
    const key = `${address.family}:${address.address}`;
    if (!seen.has(key)) {
      addresses.push(address);
      seen.add(key);
    }
  }

  return { url, hostname, addresses };
}

export function assertPublicIpAddress(address: string, label = "HTTP URL policy"): void {
  normalizeAndValidateAddress(address, label, false);
}

function normalizeAndValidateAddress(
  address: string,
  label: string,
  privateNetworkTrusted: boolean
): DnsAddress {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);

  if (family === 4) {
    if (!privateNetworkTrusted && BLOCKED_IPV4.check(normalized, "ipv4")) {
      throw new UrlPolicyError(
        `${label}: private, loopback, link-local, multicast, or reserved IPv4 targets are not allowed`
      );
    }
    return { address: normalized, family };
  }

  if (family === 6) {
    const lower = normalized.toLowerCase();
    const mappedPrefix = "::ffff:";
    if (lower.startsWith(mappedPrefix)) {
      normalizeAndValidateAddress(lower.slice(mappedPrefix.length), label, privateNetworkTrusted);
      return { address: lower, family: 6 };
    }

    if (!privateNetworkTrusted && BLOCKED_IPV6.check(lower, "ipv6")) {
      throw new UrlPolicyError(
        `${label}: private, loopback, link-local, multicast, or reserved IPv6 targets are not allowed`
      );
    }
    return { address: lower, family };
  }

  throw new UrlPolicyError(`${label}: resolved target is not a valid IP address`);
}

function normalizeHostname(hostname: string): string {
  return (
    hostname.trim().replace(/^\[/, "").replace(/\]$/, "").split("%", 1)[0]?.toLowerCase() ?? ""
  );
}

async function defaultDnsLookup(hostname: string): Promise<DnsAddress[]> {
  return defaultLookup(hostname, { all: true, verbatim: true });
}
