import type { DataSourceHealthStatus } from "@field-sales-os/schemas";

// Phase 7 — Data Source Health. Per the constitution, health reflects data
// quality/usability, not just connectivity. Derived from the latest
// validation/refresh outcome — never set directly by a user.
export function computeHealthStatus(params: { structuralValid: boolean; validationScore: number | null }): DataSourceHealthStatus {
  if (!params.structuralValid) return "ERROR";
  if (params.validationScore === null) return "OFFLINE";
  if (params.validationScore >= 1) return "HEALTHY";
  if (params.validationScore > 0) return "WARNING";
  return "ERROR";
}
