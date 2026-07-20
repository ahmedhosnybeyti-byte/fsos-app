import { apiFetch } from "../api-client";
import type { AssistantChatRequest, AssistantChatResponse } from "../types";

export const assistantApi = {
  chat: (body: AssistantChatRequest) => apiFetch<AssistantChatResponse>("/assistant/chat", { method: "POST", body }),
};
