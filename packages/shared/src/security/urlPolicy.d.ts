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
export declare class UrlPolicyError extends Error {
    constructor(message: string);
}
export declare function assertPublicHttpUrl(input: string | URL, options?: UrlPolicyOptions): Promise<URL>;
export declare function resolvePublicHttpUrl(input: string | URL, options?: UrlPolicyOptions): Promise<PublicHttpUrlResolution>;
export declare function assertPublicIpAddress(address: string, label?: string): void;
//# sourceMappingURL=urlPolicy.d.ts.map