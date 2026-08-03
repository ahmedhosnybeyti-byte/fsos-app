import { apiFetch } from "../api-client";
import type { SmartLoadingSession } from "../types";

export const smartLoadingApi = {
  getSession: (targetDate?: string) => apiFetch<SmartLoadingSession>(`/smart-loading/session${targetDate ? `?targetDate=${encodeURIComponent(targetDate)}` : ""}`),
};
