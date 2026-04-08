import { Parser } from "expr-eval";

export class Transformer {
    private parser = new Parser();

    constructor() {
        // Register custom functions for expressions
        this.parser.functions.includes = (array: unknown[], val: unknown) => {
            if (!Array.isArray(array)) return false;
            return array.includes(val);
        };
        this.parser.functions.uppercase = (str: string) => str.toUpperCase();
        this.parser.functions.lowercase = (str: string) => str.toLowerCase();
    }

    transform(template: string, context: Record<string, unknown>): unknown {
        // Find {{ expression }} and evaluate
        const regex = /\{\{(.*?)\}\}/g;
        
        let match;
        let lastIndex = 0;
        let resultString = '';
        let resultObject: unknown = null;
        let matchCount = 0;

        while ((match = regex.exec(template)) !== null) {
            matchCount++;
            const expression = match[1]!.trim();
            const val = this.parseExpression(expression, context);
            
            // If the entire string is just one expression, we can return the object directly
            if (match[0] === template) {
                resultObject = val;
            }

            resultString += template.substring(lastIndex, match.index) + String(val);
            lastIndex = regex.lastIndex;
        }

        if (matchCount === 1 && resultObject !== null) {
            return resultObject;
        }

        if (matchCount > 0) {
            resultString += template.substring(lastIndex);
            return resultString;
        }

        return template;
    }

    private parseExpression(expr: string, context: Record<string, unknown>): unknown {
        try {
            // "pr.labels | includes('needs-ticket')" syntax mapping to standard functions
            let standardExpr = expr;
            if (expr.includes('|')) {
                const parts = expr.split('|').map(p => p.trim());
                if (parts.length === 2) {
                    const val = parts[0]!;
                    const func = parts[1]!;
                    const funcName = func.split('(')[0];
                    const funcArgs = func.includes('(') ? func.split('(')[1]!.replace(')', '') : '';
                    
                    if (funcArgs) {
                        standardExpr = `${funcName}(${val}, ${funcArgs})`;
                    } else {
                        standardExpr = `${funcName}(${val})`;
                    }
                }
            }
            return this.parser.evaluate(standardExpr, context as never);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return `[EvalError: ${message}]`;
        }
    }
}
