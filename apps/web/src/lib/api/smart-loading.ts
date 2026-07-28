import { apiFetch } from "../api-client";
import type { SmartLoadingSession } from "../types";

export const smartLoadingApi = {
  getSession: () => apiFetch<SmartLoadingSession>("/smart-loading/session"),
};
