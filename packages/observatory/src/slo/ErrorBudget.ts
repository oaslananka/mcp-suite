export interface SLODefinition {
  name: string;
  type: "error_rate" | "availability" | string;
  target: number;
  window: string;
}

export interface ErrorBudgetStatus {
  status: "healthy" | "warning" | "breached";
  budgetRemaining: number;
}

export class ErrorBudget {
  calculate(slo: SLODefinition, observedAvailability: number): ErrorBudgetStatus {
    const totalBudget = Number((100 - slo.target).toFixed(2));
    const consumedBudget = Math.max(0, Number((100 - observedAvailability).toFixed(2)));
    const budgetRemaining = Math.max(0, Number((totalBudget - consumedBudget).toFixed(2)));

    if (budgetRemaining === 0) {
      return { status: "breached", budgetRemaining };
    }

    if (budgetRemaining <= totalBudget * 0.25) {
      return { status: "warning", budgetRemaining };
    }

    return { status: "healthy", budgetRemaining };
  }
}
