import type { StartVisitExecution, SaveVisitExecution, VisitExecution, VisitExecutionPhoto } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { VisitCopilotBriefing } from "../types";

export interface VisitExecutionContext {
  briefing: Pick<VisitCopilotBriefing, "period" | "sales" | "returns" | "dataAvailability" | "topProducts" | "missingProducts"> & {
    customer360?: Pick<NonNullable<VisitCopilotBriefing["customer360"]>, "averageInvoiceValue" | "soldSkus" | "lostSkus">;
  };
  lastInvoice: { number: string; date: string; amount: number | null } | null;
  lastPayment: { date: string; amount: number | null } | null;
  returnProducts: { productCode: string; reason: string; amount: number | null }[];
  previousNotes: { id: string; notes: string; startedAt: string }[];
  importedNotes: { id: string; notes: string; date: string }[];
  balance: null; collectionVisitSuccessRate: null;
}
const path = (id: string) => `/sfa/visits/${encodeURIComponent(id)}`;
export const visitExecutionApi = {
  access: () => apiFetch<{ allowed: boolean }>("/sfa/visits/access"),
  start: (body: StartVisitExecution) => apiFetch<VisitExecution>("/sfa/visits", { method: "POST", body }),
  read: (id: string) => apiFetch<{ visit: VisitExecution; photos: VisitExecutionPhoto[] }>(path(id)),
  context: (id: string) => apiFetch<VisitExecutionContext>(`${path(id)}/context`),
  save: (id: string, body: SaveVisitExecution) => apiFetch<VisitExecution>(path(id), { method: "PATCH", body }),
  upload: (id: string, file: File, kind: VisitExecutionPhoto["kind"], requestKey: string) => {
    const formData = new FormData();
    formData.append("file", file); formData.append("kind", kind); formData.append("requestKey", requestKey);
    return apiFetch<{ id: string }>(`${path(id)}/photos`, { method: "POST", formData });
  },
  photoUrl: (id: string, photoId: string) => apiFetch<{ url: string }>(`${path(id)}/photos/${encodeURIComponent(photoId)}/url`),
};
