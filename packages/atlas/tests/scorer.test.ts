import { describe, it, expect } from 'vitest';
import { QualityScorer } from '../src/scoring/QualityScorer.js';
import { SecurityScanner, CompatMatrix, CommunityMetrics } from '../src/scoring/index.js';
import { GitHubRepo, MCPServerManifest } from '../src/scoring/types.js';

describe('QualityScorer', () => {
    it('calculates score breakdown', async () => {
        const scorer = new QualityScorer(new SecurityScanner(), new CompatMatrix(), new CommunityMetrics());
        
        const repo: GitHubRepo = {
            id: 1, name: 'test', full_name: 'test/test', html_url: '',
            description: 'A very long description that exceeds 50 chars to get full points.',
            created_at: '', updated_at: new Date().toISOString(), pushed_at: '',
            stargazers_count: 500, has_wiki: true, license: { key: 'mit', name: 'MIT' }, topics: []
        };
        
        const manifest: MCPServerManifest = {
             name: 'test', version: '1', description: '', mcp: { tools_count: 5 } as any
        };
        
        const result = await scorer.calculate(repo, manifest, 'server1');
        
        expect(result.total).toBeGreaterThan(0);
        expect(result.breakdown['readme']).toBe(10); // Description > 50
        expect(result.breakdown['tools']).toBe(10);  // Tools count > 0
    });
});
