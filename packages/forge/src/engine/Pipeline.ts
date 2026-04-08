import { PipelineConfig, StepConfig } from "../dsl/schema.js";
import { compile, PipelineGraph } from "../dsl/compiler.js";

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export class Pipeline {
    private config: PipelineConfig;
    private graph: PipelineGraph;

    constructor(config: PipelineConfig) {
        this.config = config;
        this.graph = compile(config);
    }

    validate(): ValidationResult {
        // Zod parsing has already happened in dsl/parser, but here we would 
        // add extra checks like circular dependencies, missing server references, etc.
        const errors: string[] = [];
        
        // Basic check: do all servers referenced in steps exist in config?
        for (const step of this.config.steps) {
            if ('server' in step && step.server) {
                if (!this.config.servers || !this.config.servers[step.server]) {
                    errors.push(`Step '${step.id}' references undefined server '${step.server}'`);
                }
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Pipeline validation failed:\n${errors.join('\n')}`);
        }
        
        return { valid: true, errors: [] };
    }

    compile(): PipelineGraph {
        return this.graph;
    }

    getStep(id: string): StepConfig | undefined {
        return this.graph.steps.get(id);
    }

    getExecutionOrder(): string[][] {
        return this.graph.groups;
    }
}
