import { describe, it, expect } from 'vitest';
import { generateId } from '../src/utils/uuid.js';

describe('UUID utility', () => {
    it('generates a valid v4 UUID', () => {
        const id = generateId();
        expect(id).toBeDefined();
        expect(id.length).toBe(36);
        expect(id.split('-').length).toBe(5);
    });
});
