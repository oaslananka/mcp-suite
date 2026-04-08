import { describe, it, expect } from 'vitest';
import { PiiScrubber } from '../src/middleware/PiiScrubber.js';

describe('PiiScrubber', () => {
    it('masks email addresses', () => {
        const scrubber = new PiiScrubber();
        const result = scrubber.scrub('Contact me at test@example.com');
        expect(result).toBe('Contact me at ***@***.***');
    });

    it('masks nested object PII', () => {
        const scrubber = new PiiScrubber();
        const data = { user: { email: 'john@doe.com', phone: '555-123-4567' } };
        const result: any = scrubber.scrub(data);
        
        expect(result.user.email).toBe('***@***.***');
        expect(result.user.phone).toBe('***-***-****');
    });
});
