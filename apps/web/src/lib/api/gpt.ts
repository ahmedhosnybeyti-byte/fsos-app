import type { ConfigureGptInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { GptConfig } from "../types";

export const gptApi = {
  mine: () => apiFetch<GptConfig | null>("/gpt/me"),
  configure: (input: ConfigureGptInput) =>
    apiFetch<GptConfig | { apiKey: string; note: string }>("/gpt/configure", { method: "POST", body: input }),
  regenerateKey: () => apiFetch<{ apiKey: string; note: string }>("/gpt/regenerate-key", { method: "POST" }),
  launch: () =>
    apiFetch<{ launchCode: string; gptUrl: string; expiresInMinutes: number }>("/gpt/launch", { method: "POST" }),
};
