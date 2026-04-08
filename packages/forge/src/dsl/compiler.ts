import { PipelineConfig, StepConfig } from './schema.js';

export interface PipelineGraph {
  steps: Map<string, StepConfig>;
  edges: Map<string, string[]>;
  entryPoints: string[];
  groups: string[][];
}

export function compile(config: PipelineConfig): PipelineGraph {
    const steps = new Map<string, StepConfig>();
    const edges = new Map<string, string[]>();
    const entryPoints: string[] = [];
    const groups: string[][] = [];

    // Flatten step definitions
    function registerStep(step: StepConfig) {
        if (steps.has(step.id)) {
            throw new Error(`Duplicate step id found: ${step.id}`);
        }
        steps.set(step.id, step);
        
        // Register children for parallel/loop
        if ('type' in step && step.type === 'parallel') {
            for (const child of step.steps) {
                registerStep(child);
            }
        }
        if ('type' in step && step.type === 'loop') {
            for (const child of step.steps) {
                registerStep(child);
            }
        }
    }

    for (const step of config.steps) {
        registerStep(step);
    }

    // Build naive sequence (everything sequential unless it's a condition or parallel)
    for (let i = 0; i < config.steps.length; i++) {
        const step = config.steps[i]!;
        
        if (i === 0) {
            entryPoints.push(step.id);
        }

        // Parallel steps are grouped
        if ('type' in step && step.type === 'parallel') {
            groups.push(step.steps.map(s => s.id));
        } else {
            groups.push([step.id]);
        }

        if ('type' in step && step.type === 'condition') {
            if (!steps.has(step.on_true)) throw new Error(`Condition step '${step.id}' references undefined step '${step.on_true}'`);
            if (!steps.has(step.on_false)) throw new Error(`Condition step '${step.id}' references undefined step '${step.on_false}'`);
            
            edges.set(step.id, [step.on_true, step.on_false]);
        } else if (i < config.steps.length - 1) {
             edges.set(step.id, [config.steps[i+1]!.id]);
        }
    }

    return {
        steps,
        edges,
        entryPoints,
        groups
    };
}
