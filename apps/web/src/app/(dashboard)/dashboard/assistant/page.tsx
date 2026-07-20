"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Bot, Send, User } from "lucide-react";
import { assistantApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { AnalysisBlockRenderer } from "@/components/analysis-studio/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { decodeSgiContext, sgiContextToMessage } from "@/lib/sgi-context";
import type { AnalysisBlock, AssistantChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/components/translation-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";

// Native, in-app replacement for the external "Launch Custom GPT" flow —
// one simple chat, no separate Analysis Studio hop needed: any table/KPI/
// map the assistant returns renders inline under its own message. Kept
// deliberately minimal (no sidebar, no visible tool list, no settings) —
// the assistant's tool calls (dataset lookups, block rendering) happen
// server-side and only their *results* ever reach this screen.
const MAX_HISTORY_SENT = 20;

interface DisplayMessage extends AssistantChatMessage {
  blocks?: AnalysisBlock[];
}

const SUGGESTION_KEYS: TranslationKey[] = ["assistant.suggestion1", "assistant.suggestion2", "assistant.suggestion3"];

// useSearchParams() requires a Suspense boundary above it in the App
// Router — this wrapper is that boundary. The actual page lives in
// AssistantChat below; kept as a separate component only so the "use
// client" chat logic doesn't have to also own the Suspense fallback.
export default function AssistantPage() {
  return (
    <Suspense fallback={null}>
      <AssistantChat />
    </Suspense>
  );
}

function AssistantChat() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const mutation = useMutation({
    mutationFn: assistantApi.chat,
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply, blocks: data.blocks }]);
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : t("assistant.errorFallback");
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, mutation.isPending]);

  // Consumes a "ناقشني" deep link from any SGI producer (today: the Sales
  // Growth screen — see sales-growth/page.tsx + lib/sgi-context.ts): a
  // ?context=... query param carrying a typed SGIContext. If present and
  // valid, auto-send it as the opening message so the conversation starts
  // already grounded in that decision — the user never has to retype what
  // they were just looking at. Guarded with a ref so React's dev-mode
  // double-effect doesn't send it twice; the param is stripped from the
  // URL right after so refreshing this page afterwards starts empty.
  const consumedContextRef = useRef(false);
  useEffect(() => {
    if (consumedContextRef.current) return;
    consumedContextRef.current = true;
    const context = decodeSgiContext(searchParams.get("context"));
    if (context) {
      router.replace("/dashboard/assistant");
      send(sgiContextToMessage(context));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || mutation.isPending) return;
    const history: AssistantChatMessage[] = messages.slice(-MAX_HISTORY_SENT).map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    mutation.mutate({ message: trimmed, history });
  }

  // Restyled per FSOS Design Constitution §4.1/§7.6 (Murshidak visual
  // identity: AI Purple + Crystal Glass + Intelligent Glow), matching the
  // treatment already applied to AssistantEntryCard on the Dashboard.
  // Renamed from the generic "المساعد" to the official product name
  // "مرشدك" per Appendix §18.2 — copy only, no logic change. Purely visual:
  // no chat/API/history behavior touched.
  return (
    <div className="relative flex h-[calc(100vh-8rem)] flex-col">
      <div aria-hidden className="dashboard-cinematic-bg pointer-events-none fixed inset-0 -z-10" />
      <div aria-hidden className="dashboard-starfield pointer-events-none fixed inset-0 -z-10 hidden opacity-60 dark:block" />

      <div className="mb-4 flex items-center gap-3">
        <span className="crystal-badge h-14 w-14 shrink-0 bg-ai/15 text-ai drop-shadow-[0_0_24px_hsl(var(--ai)/0.5)]">
          <Bot className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("assistant.title")}</h1>
          <p className="text-muted-foreground">{t("assistant.subtitle")}</p>
        </div>
      </div>

      <div className="glass-card glow-ai flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="crystal-badge h-14 w-14 bg-ai/15 text-ai drop-shadow-[0_0_24px_hsl(var(--ai)/0.5)]">
              <Bot className="h-6 w-6" />
            </span>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTION_KEYS.map((key) => {
                const s = t(key);
                return (
                  <button
                    key={key}
                    onClick={() => send(s)}
                    className="rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:border-ai/40 hover:bg-ai/5 hover:text-foreground"
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("rise-in flex gap-3", m.role === "user" && "flex-row-reverse")}>
            <span
              className={cn(
                "crystal-badge h-7 w-7 shrink-0",
                m.role === "user" ? "bg-primary/15 text-primary" : "bg-ai/15 text-ai",
              )}
            >
              {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </span>
            <div
              className={cn(
                "max-w-[80%] space-y-3 rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                m.role === "user"
                  ? "bg-primary text-primary-foreground shadow-[0_4px_18px_-6px_hsl(var(--primary)/0.5)]"
                  : "glass-card",
              )}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.blocks && m.blocks.length > 0 && (
                <div className="space-y-3">
                  {m.blocks.map((block) => (
                    <div key={block.id} className="rounded-md bg-background/60 p-3">
                      <AnalysisBlockRenderer block={block} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {mutation.isPending && (
          <div className="rise-in flex gap-3">
            <span className="crystal-badge h-7 w-7 shrink-0 bg-ai/15 text-ai">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <div className="glass-card flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" /> {t("assistant.thinking")}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-4 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={t("assistant.inputPlaceholder")}
          disabled={mutation.isPending}
          className="bg-card/80 backdrop-blur-sm"
        />
        <Button onClick={() => send(input)} disabled={mutation.isPending || !input.trim()} className="bg-ai hover:bg-ai/90">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
