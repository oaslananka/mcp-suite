import { describe, it, expect } from 'vitest';
import { MockEngine } from '../src/lib/mockEngine.js';

describe('MockEngine', () => {
    it('evaluates matched rules successfully', async () => {
        const engine = new MockEngine();
        engine.addTool({
            name: 'test_tool',
            description: 'test',
            inputSchema: {},
            rules: [
                { match: { id: 1 }, response: { status: 'ok' } }
            ]
        });

        const result = await engine.evaluate('test_tool', { id: 1 });
        expect(result.isError).toBe(false);
        expect(result.content[0].text).toContain('ok');
    });

    it('returns an error for unknown tools', async () => {
        const engine = new MockEngine();

        const result = await engine.evaluate('missing_tool', { id: 1 });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('not configured');
    });

    it('returns an error when no mock rule matches', async () => {
        const engine = new MockEngine();
        engine.addTool({
            name: 'test_tool',
            description: 'test',
            inputSchema: {},
            rules: [
                { match: { id: 1 }, response: { status: 'ok' } }
            ]
        });

        const result = await engine.evaluate('test_tool', { id: 2 });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('No mock rule matched');
    });
});
