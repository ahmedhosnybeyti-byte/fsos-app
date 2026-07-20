import { apiFetch } from "../api-client";

export interface CompanyUsageStats {
  eventCounts: Record<string, number>;
  activeUsers: number;
  activeFiles: number;
}

export interface PlatformUsageStats {
  companiesCount: number;
  usersCount: number;
  subscriptionsByStatus: Record<string, number>;
  totalEvents: number;
  eventCounts: Record<string, number>;
}

export const usageApi = {
  mine: () => apiFetch<CompanyUsageStats>("/usage/me"),
  platform: () => apiFetch<PlatformUsageStats>("/usage/platform"),
};
