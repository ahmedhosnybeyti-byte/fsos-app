import type { UpdateCompanyInput, UpdateCompanyProfileInput, CreateBranchInput, UpdateBranchInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Branch, Company, CompanyProfileData, DiscoveryProvider, Paginated } from "../types";

// Frontend-side extension of the profile PATCH contract: the API also accepts
// the discovery provider choice and a generic write-only API key for
// whichever provider is selected (empty string clears the stored
// credential). Kept as an intersection so it stays valid once the shared
// schema type gains these fields.
export type UpdateCompanyProfileBody = UpdateCompanyProfileInput & {
  discoveryProvider?: DiscoveryProvider;
  discoveryApiKey?: string;
};

export const companiesApi = {
  me: () => apiFetch<Company>("/companies/me"),
  updateMe: (input: { name?: string }) => apiFetch<Company>("/companies/me", { method: "PATCH", body: input }),
  list: (page: number, pageSize = 20, search?: string) =>
    apiFetch<Paginated<Company>>("/companies", { query: { page, pageSize, search } }),
  get: (id: string) => apiFetch<Company>(`/companies/${id}`),
  update: (id: string, input: UpdateCompanyInput) => apiFetch<Company>(`/companies/${id}`, { method: "PATCH", body: input }),
  lifecycle: (id: string, event: "CREATE" | "ACTIVATE" | "SUSPEND" | "REACTIVATE" | "ARCHIVE") =>
    apiFetch<Company>(`/companies/${id}/lifecycle/${event}`, { method: "POST" }),

  // Phase 2: Company Profile
  getProfile: () => apiFetch<CompanyProfileData>("/companies/me/profile"),
  updateProfile: (input: UpdateCompanyProfileBody) =>
    apiFetch<CompanyProfileData>("/companies/me/profile", { method: "PATCH", body: input }),
};

// Phase 2: Branch (MVP org structure) — separate export to keep companiesApi
// focused on the Company entity itself.
export const branchesApi = {
  list: () => apiFetch<Branch[]>("/companies/me/branches"),
  create: (input: CreateBranchInput) => apiFetch<Branch>("/companies/me/branches", { method: "POST", body: input }),
  update: (id: string, input: UpdateBranchInput) =>
    apiFetch<Branch>(`/companies/me/branches/${id}`, { method: "PATCH", body: input }),
  archive: (id: string) => apiFetch<Branch>(`/companies/me/branches/${id}/archive`, { method: "POST" }),
};
