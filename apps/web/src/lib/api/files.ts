import { apiFetch } from "../api-client";
import type { FileRecord } from "../types";

export const filesApi = {
  list: () => apiFetch<FileRecord[]>("/files"),
  // No dataset-type input — the platform classifies the workbook itself.
  upload: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<FileRecord>("/files", { method: "POST", formData });
  },
  confirmType: (id: string, datasetType: string, sheetIndex?: number) =>
    apiFetch<FileRecord>(`/files/${id}/confirm-type`, { method: "PATCH", body: { datasetType, sheetIndex } }),
  remove: (id: string) => apiFetch<FileRecord>(`/files/${id}`, { method: "DELETE" }),
  downloadUrl: (id: string) => apiFetch<{ url: string }>(`/files/${id}/download-url`),
};
