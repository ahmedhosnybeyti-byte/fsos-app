import type {
  CreateDataSourceInput,
  CreateDataSourceTypeInput,
  TestDataSourceConnectionResult,
  UpdateDataSourceInput,
} from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { DataSource, DataSourceType } from "../types";

// Phase 6: Data Sources Management — definitions/metadata only. No file
// upload/replace/sync here (that stays in the existing Files module /
// future Refresh Center).
export const dataSourcesApi = {
  list: (params?: { status?: string; type?: string }) =>
    apiFetch<DataSource[]>("/companies/me/data-sources", { query: params }),
  get: (id: string) => apiFetch<DataSource>(`/companies/me/data-sources/${id}`),
  create: (input: CreateDataSourceInput) =>
    apiFetch<DataSource>("/companies/me/data-sources", { method: "POST", body: input }),
  update: (id: string, input: UpdateDataSourceInput) =>
    apiFetch<DataSource>(`/companies/me/data-sources/${id}`, { method: "PATCH", body: input }),
  remove: (id: string) => apiFetch<{ success: boolean }>(`/companies/me/data-sources/${id}`, { method: "DELETE" }),
  testConnection: (id: string) =>
    apiFetch<TestDataSourceConnectionResult>(`/companies/me/data-sources/${id}/test-connection`, { method: "POST" }),
};

export const dataSourceTypesApi = {
  list: () => apiFetch<DataSourceType[]>("/data-source-types"),
  create: (input: CreateDataSourceTypeInput) =>
    apiFetch<DataSourceType>("/data-source-types", { method: "POST", body: input }),
};
