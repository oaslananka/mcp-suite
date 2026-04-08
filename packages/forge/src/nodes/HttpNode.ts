import { BaseNode } from './BaseNode.js';
import type { StepConfig } from '../dsl/schema.js';
import type { RunContext } from '../runtime/RunContext.js';
import type { StepResult } from '../engine/Step.js';
import { Transformer } from '../engine/Transformer.js';
import fetch from 'node-fetch';

export class HttpNode extends BaseNode {
    private transformer = new Transformer();

    async execute(step: StepConfig, ctx: RunContext): Promise<StepResult> {
        if (!('url' in step) || !('method' in step)) {
             return { status: 'failed', error: 'Missing url or method in HTTP node' };
        }
        
        try {
             const templateContext = ctx.dataBus.toTemplateContext();
             
             // Resolve URL
             let resolvedUrl = step.url as string;
             if (resolvedUrl.includes('{{')) {
                 resolvedUrl = this.transformer.transform(resolvedUrl, templateContext) as string;
             }

             // Resolve Headers
             const resolvedHeaders: Record<string, string> = {};
             if (step.headers) {
                 for (const [key, value] of Object.entries(step.headers as Record<string, string>)) {
                     if (value.includes('{{')) {
                         resolvedHeaders[key] = String(this.transformer.transform(value, templateContext));
                     } else {
                         resolvedHeaders[key] = value;
                     }
                 }
             }

             // Resolve Body
             let resolvedBody: string | undefined;
             if (step.body) {
                 if (typeof step.body === 'string' && step.body.includes('{{')) {
                     resolvedBody = String(this.transformer.transform(step.body, templateContext));
                 } else if (typeof step.body === 'object' && step.body !== null) {
                     // Shallow resolve for object body (could be deeper in real implementation)
                     const transformedBody: Record<string, unknown> = {};
                     for (const [k, v] of Object.entries(step.body)) {
                         if (typeof v === 'string' && v.includes('{{')) {
                             transformedBody[k] = this.transformer.transform(v, templateContext);
                         } else {
                             transformedBody[k] = v;
                         }
                     }
                     resolvedBody = JSON.stringify(transformedBody);
                 } else {
                     resolvedBody = typeof step.body === "string" ? step.body : JSON.stringify(step.body);
                 }
             }

             ctx.logger.info(`HTTP ${step.method} to ${resolvedUrl}`);
             const response = await fetch(resolvedUrl, {
                 method: step.method as string,
                 headers: resolvedHeaders,
                 ...(resolvedBody !== undefined ? { body: resolvedBody } : {})
             });

             const text = await response.text();
             let data = text;
             try {
                 data = JSON.parse(text);
             } catch (_e) {
                 // Ignore parse error, return as string
             }

             if (!response.ok) {
                 return { status: 'failed', error: `HTTP ${response.status} - ${response.statusText}`, output: data };
             }

             return { status: 'success', output: data };
        } catch (error: unknown) {
             return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
    }
}
