import { Parser } from "expr-eval-fork";
import { logger } from "@oaslananka/shared";

export class ConditionEval {
  private parser = new Parser();

  evaluate(condition: string, context: Record<string, unknown>): boolean {
    try {
      return Boolean(this.parser.evaluate(condition, context as never));
    } catch (error: unknown) {
      logger.warn({ err: error, condition }, "Condition evaluation error");
      return false;
    }
  }
}
