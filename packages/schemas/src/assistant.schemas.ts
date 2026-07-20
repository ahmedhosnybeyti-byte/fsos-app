import { z } from "zod";
import { analysisBlockSchema } from "./analysis-studio.schemas";

// The native, Claude-powered replacement for the external ChatGPT Custom
// GPT screen (see PROJECT_LOG.md). Stateless by design — no conversation
// table, no server-side session: the frontend keeps the running message
// list in memory and resends it (capped) on every turn, same shape a
// plain chat UI already needs. This avoids a DB migration entirely; if a
// persisted conversation history is wanted later, that's an additive
// table, not a change to this contract.
export const ASSISTANT_LIMITS = {
  maxMessageLength: 4000,
  maxHistoryMessages: 20, // trimmed client-side; server also enforces this cap
  maxHistoryContentLength: 4000,
};

export const assistantChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(ASSISTANT_LIMITS.maxHistoryContentLength),
});
export type AssistantChatMessage = z.infer<typeof assistantChatMessageSchema>;

export const assistantChatRequestSchema = z.object({
  message: z.string().min(1).max(ASSISTANT_LIMITS.maxMessageLength),
  history: z.array(assistantChatMessageSchema).max(ASSISTANT_LIMITS.maxHistoryMessages).default([]),
});
export type AssistantChatRequest = z.infer<typeof assistantChatRequestSchema>;

export const assistantChatResponseSchema = z.object({
  reply: z.string(),
  blocks: z.array(analysisBlockSchema).default([]),
});
export type AssistantChatResponse = z.infer<typeof assistantChatResponseSchema>;
