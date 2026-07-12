import type { UpdateSubscriptionInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Paginated, Subscription } from "../types";

export const subscriptionsApi = {
  mine: () => apiFetch<Subscription>("/subscriptions/me"),
  list: (page: number, pageSize = 20) =>
    apiFetch<Paginated<Subscription>>("/subscriptions", { query: { page, pageSize } }),
  update: (companyId: string, input: UpdateSubscriptionInput) =>
    apiFetch<Subscription>(`/subscriptions/${companyId}`, { method: "PATCH", body: input }),
};
