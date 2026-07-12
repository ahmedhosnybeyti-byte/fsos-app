import { apiFetch } from "../api-client";
import type { AuditLogEntry, Paginated } from "../types";

export const auditApi = {
  list: (page: number, pageSize = 20, companyId?: string) =>
    apiFetch<Paginated<AuditLogEntry>>("/audit-log", { query: { page, pageSize, companyId } }),
};
