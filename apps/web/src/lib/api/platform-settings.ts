import type { UpdatePlatformSettingsInput } from "@field-sales-os/schemas";
import { apiFetch } from "../api-client";
import type { PlatformSettings } from "../types";

export const platformSettingsApi = {
  get: () => apiFetch<PlatformSettings>("/platform-settings"),
  getPublicTrialRegistrationVisibility: () => apiFetch<{ showTrialRegistration: boolean }>("/platform-settings/public-trial-registration"),
  update: (input: UpdatePlatformSettingsInput) =>
    apiFetch<PlatformSettings>("/platform-settings", { method: "PATCH", body: input }),
};
