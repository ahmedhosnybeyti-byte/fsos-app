import type { VisitCopilotPeriod } from "@/lib/types";

export interface Daily360SummaryQueryInput {
  period: VisitCopilotPeriod;
  selectedDate: string;
  from?: string;
  to?: string;
}

export function daily360SummaryQuery(input: Daily360SummaryQueryInput) {
  return {
    queryKey: ["visit-copilot", "daily-360-summary", input.period, input.from, input.to, input.selectedDate] as const,
    request: { period: input.period, from: input.from, to: input.to, date: input.selectedDate },
  };
}