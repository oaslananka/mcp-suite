import { describe, it, expect } from 'vitest';
import { ErrorBudget } from '../src/slo/ErrorBudget.js';

describe('ErrorBudget', () => {
    it('calculates remaining budget accurately', () => {
        const calculator = new ErrorBudget();
        
        const slo = { name: 'test', type: 'error_rate' as any, target: 99.0, window: '30d' };
        
        const result = calculator.calculate(slo, 99.5);
        expect(result.status).toBe('healthy');
        expect(result.budgetRemaining).toBe(0.5); // total 1.0, consumed 0.5
    });

    it('flags breached budgets', () => {
        const calculator = new ErrorBudget();
        
        const slo = { name: 'test', type: 'error_rate' as any, target: 99.0, window: '30d' };
        
        const result = calculator.calculate(slo, 98.5); // 1.5% errors > 1% budget
        expect(result.status).toBe('breached');
        expect(result.budgetRemaining).toBe(0);
    });
});
