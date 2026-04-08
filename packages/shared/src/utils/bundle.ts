import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';

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

async function addFilesToZip(zip: JSZip, dirPath: string, basePath: string) {
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        const relativePath = path.relative(basePath, fullPath);

        if (item.isDirectory()) {
            await addFilesToZip(zip, fullPath, basePath);
        } else {
            const fileData = await fs.readFile(fullPath);
            zip.file(relativePath, fileData);
        }
    }
}

export async function packBundle(dir: string, outputPath: string, manifest: BundleManifest): Promise<void> {
    const zip = new JSZip();

    // Ensure directory exists
    try {
        await fs.access(dir);
    } catch {
        throw new Error(`Directory ${dir} does not exist`);
    }

    // Add files
    await addFilesToZip(zip, dir, dir);

    // Add manifest
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const content = await zip.generateAsync({ type: 'nodebuffer' });
    
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });
    
    await fs.writeFile(outputPath, content);
}

export async function unpackBundle(bundlePath: string, outputDir: string): Promise<BundleManifest> {
    const fileData = await fs.readFile(bundlePath);
    const zip = await JSZip.loadAsync(fileData);

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
        throw new Error('manifest.json not found in bundle');
    }

    const manifestContent = await manifestFile.async('string');
    const manifest = JSON.parse(manifestContent) as BundleManifest;

    await fs.mkdir(outputDir, { recursive: true });

    for (const [filename, file] of Object.entries(zip.files)) {
        if (!file.dir) {
            const content = await file.async('nodebuffer');
            const fullPath = path.join(outputDir, filename);
            const dir = path.dirname(fullPath);
            await fs.mkdir(dir, { recursive: true });
            await fs.writeFile(fullPath, content);
        }
    }

    return manifest;
}
