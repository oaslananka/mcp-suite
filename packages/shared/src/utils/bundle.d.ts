export interface BundleManifest {
    name: string;
    version: string;
    description: string;
    entrypoint: string;
    mcpVersion: string;
    transport: ("stdio" | "http")[];
    author?: string;
    license?: string;
    homepage?: string;
    signature?: string;
}
export declare function packBundle(dir: string, outputPath: string, manifest: BundleManifest): Promise<void>;
export declare function unpackBundle(bundlePath: string, outputDir: string): Promise<BundleManifest>;
//# sourceMappingURL=bundle.d.ts.map