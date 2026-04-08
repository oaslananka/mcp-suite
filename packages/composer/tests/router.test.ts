import { describe, it, expect } from 'vitest';
import { NamespacedTools } from '../src/proxy/NamespacedTools.js';
import { ToolRouter } from '../src/proxy/ToolRouter.js';
import { Tool } from '@oaslananka/shared';

describe('ToolRouter', () => {
    it('namespaces and decodes tool names correctly', () => {
        const router = new ToolRouter('__');
        const tool: Tool = { name: 'list', description: 'Lists', inputSchema: {} };
        
        const namespaced = NamespacedTools.add(tool, 'github', '__');
        expect(namespaced.name).toBe('github__list');
        
        const route = router.route(namespaced.name);
        expect(route).toEqual({ backendName: 'github', toolName: 'list' });
    });
});
