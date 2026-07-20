import type { UpsertCompanyPolicyInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { CompanyPolicyData, ComplianceOverviewData, PlatformObservabilityData } from "../types";

// Phase 9 — Security, Governance & Audit.
export const companyPoliciesApi = {
  list: () => apiFetch<CompanyPolicyData[]>("/companies/me/policies"),
  upsert: (input: UpsertCompanyPolicyInput) => apiFetch<CompanyPolicyData>("/companies/me/policies", { method: "POST", body: input }),
};

export const complianceApi = {
  getOverview: () => apiFetch<ComplianceOverviewData>("/companies/me/compliance"),
};

export const observabilityApi = {
  getMetrics: () => apiFetch<PlatformObservabilityData>("/platform/observability"),
};
