import { apiFetch } from "../api-client";
import type { AnalysisEvent } from "../types";

export const analysisStudioApi = {
  listEvents: () => apiFetch<AnalysisEvent[]>("/analysis-studio/events"),
};
