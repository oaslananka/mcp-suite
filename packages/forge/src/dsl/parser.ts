import yaml from 'js-yaml';
import fs from 'fs/promises';
import { PipelineConfig, PipelineConfigSchema } from './schema.js';

function substituteEnvVars(content: string): string {
    return content.replace(/\$\{([A-Z0-9_]+)\}/g, (match, envVar) => {
        return process.env[envVar] || match;
    });
}

export function parsePipelineYaml(yamlString: string): PipelineConfig {
    const substituted = substituteEnvVars(yamlString);
    const parsed = yaml.load(substituted);
    
    const result = PipelineConfigSchema.safeParse(parsed);
    if (!result.success) {
        const errors = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join('\n');
        throw new Error(`Pipeline configuration is invalid:\n${errors}`);
    }
    
    return result.data;
}

export async function parsePipelineFile(filePath: string): Promise<PipelineConfig> {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    return parsePipelineYaml(fileContent);
}
