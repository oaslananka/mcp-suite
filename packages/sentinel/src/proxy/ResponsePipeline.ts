import { ToolCallResult } from "@oaslananka/shared";
import { VirtualKey } from "../auth/KeyManager.js";
import { PiiScrubber } from "../middleware/PiiScrubber.js";

export interface ResponseContext {
  key: VirtualKey;
}

export interface ResponseMiddleware {
  name: string;
  process(response: ToolCallResult, ctx: ResponseContext): Promise<ToolCallResult>;
}

class PIIRedactionMiddleware implements ResponseMiddleware {
  name = "pii-redaction";
  private readonly scrubber = new PiiScrubber();

  async process(response: ToolCallResult): Promise<ToolCallResult> {
    return this.scrubber.scrub(response);
  }
}

export class ResponsePipeline {
  private readonly middlewares: ResponseMiddleware[] = [new PIIRedactionMiddleware()];

  use(middleware: ResponseMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  async process(response: ToolCallResult, ctx: ResponseContext): Promise<ToolCallResult> {
    let current = response;
    for (const middleware of this.middlewares) {
      current = await middleware.process(current, ctx);
    }
    return current;
  }
}
