import { apiFetch } from "../api-client";
import type { FileBatchUploadResult, FileRecord, FileSearchRowsResult, ReplaceFileResult } from "../types";

export const filesApi = {
  // companyId is only meaningful for a SUPER_ADMIN (the target company
  // picked on the Files screen) — regular users' lists are always scoped
  // to their own company server-side, and a mismatching companyId is
  // rejected, not ignored.
  list: (companyId?: string) => apiFetch<FileRecord[]>(companyId ? `/files?companyId=${encodeURIComponent(companyId)}` : "/files"),
  // Plain free-text row search inside one file — see FilesService.searchRows.
  searchRows: (id: string, q: string, limit?: number) =>
    apiFetch<FileSearchRowsResult>(
      `/files/${id}/search-rows?${new URLSearchParams({ q, ...(limit ? { limit: String(limit) } : {}) }).toString()}`,
    ),
  // No dataset-type input, no column mapping — the platform matches the
  // file against the FSOS Import Templates and validates it (ADR-001 §2).
  // A single physical upload can now contain multiple sheets (up to 18
  // canonical entities, 2026-07-19) — each named sheet is validated
  // independently and the result comes back as a BatchUploadResult with
  // accepted/rejected/ignored buckets. The one exception: when exactly one
  // sheet was attempted and it failed outright, the backend still throws
  // the pre-existing HTTP 422 + ApiError.errors = ValidationReport shape
  // for backward compat (see FilesService.uploadFile).
  // targetCompanyId: SUPER_ADMIN only — which company this upload belongs
  // to (their own account belongs to none). Regular users omit it.
  upload: (file: File, targetCompanyId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (targetCompanyId) formData.append("targetCompanyId", targetCompanyId);
    return apiFetch<FileBatchUploadResult>("/files", { method: "POST", formData });
  },
  // "استبدال ملف" (COMPANY_ADMIN only) — uploads a new file as the
  // replacement for oldFileId, carrying over its SGI file selection. See
  // FilesService.replaceFile. `otherAccepted` covers any OTHER entities the
  // same upload also contained and imported alongside the replacement.
  replace: (oldFileId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<ReplaceFileResult>(`/files/${oldFileId}/replace`, { method: "POST", formData });
  },
  remove: (id: string) => apiFetch<FileRecord>(`/files/${id}`, { method: "DELETE" }),
  downloadUrl: (id: string) => apiFetch<{ url: string }>(`/files/${id}/download-url`),
};
