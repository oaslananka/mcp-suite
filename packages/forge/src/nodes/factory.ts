import { BaseNode } from './BaseNode.js';
import { StepConfig } from '../dsl/schema.js';
import { ToolCallNode } from './ToolCallNode.js';
import { ConditionNode } from './ConditionNode.js';
import { ParallelNode } from './ParallelNode.js';
import { LoopNode } from './LoopNode.js';
import { DelayNode } from './DelayNode.js';
import { HttpNode } from './HttpNode.js';
import { LogNode } from './LogNode.js';

export function createNode(config: StepConfig): BaseNode {
    if (!('type' in config) || config.type === undefined) {
        return new ToolCallNode();
    }
    
    switch (config.type) {
        case 'condition':
            return new ConditionNode();
        case 'parallel':
            return new ParallelNode();
        case 'loop':
            return new LoopNode();
        case 'delay':
            return new DelayNode();
        case 'http':
            return new HttpNode();
        case 'log':
            return new LogNode();
        default:
            throw new Error(`Unknown step type: ${config.type}`);
    }
}
