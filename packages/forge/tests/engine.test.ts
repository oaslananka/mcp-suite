import { describe, it, expect } from 'vitest';
import { Transformer } from '../src/engine/Transformer.js';

describe('Transformer', () => {
    it('transforms basic templates', () => {
        const transformer = new Transformer();
        const ctx = { user: { name: 'Alice' } };
        const result = transformer.transform('Hello {{ user.name }}', ctx);
        expect(result).toBe('Hello Alice');
    });
    
    it('evaluates object expressions directly', () => {
        const transformer = new Transformer();
        const ctx = { pr: { labels: ['bug', 'needs-ticket'] } };
        const result = transformer.transform('{{ pr.labels }}', ctx);
        expect(result).toEqual(['bug', 'needs-ticket']);
    });
});
