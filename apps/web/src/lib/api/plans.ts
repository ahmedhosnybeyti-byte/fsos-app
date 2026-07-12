import type { CreatePlanInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { Plan } from "../types";

export const plansApi = {
  listPublic: () => apiFetch<Plan[]>("/plans"),
  listAll: () => apiFetch<Plan[]>("/plans/all"),
  create: (input: CreatePlanInput) => apiFetch<Plan>("/plans", { method: "POST", body: input }),
  update: (id: string, input: Partial<CreatePlanInput>) => apiFetch<Plan>(`/plans/${id}`, { method: "PATCH", body: input }),
};
