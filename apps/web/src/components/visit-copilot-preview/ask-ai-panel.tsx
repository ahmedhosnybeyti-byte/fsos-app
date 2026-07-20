import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { VisitCopilotChatMessage } from "@/lib/types";

export function AskAiPanel({
  messages,
  isPending,
  onSend,
}: {
  messages: VisitCopilotChatMessage[];
  isPending: boolean;
  onSend: (message: string) => void;
}) {
  const [input, setInput] = useState("");
  const submit = () => {
    if (!input.trim() || isPending) return;
    onSend(input);
    setInput("");
  };

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4" aria-labelledby="ask-ai-title">
      <h2 id="ask-ai-title" className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Bot className="h-4 w-4 text-primary" />
        اسأل الذكاء الاصطناعي
      </h2>
      {messages.length > 0 && (
        <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
          {messages.map((message, index) => (
            <p key={index} className={cn("rounded-xl px-3 py-2 text-sm", message.role === "user" ? "bg-primary text-primary-foreground" : "bg-card")}>{message.content}</p>
          ))}
          {isPending && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="h-3.5 w-3.5" /> يفكر الآن...</p>}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          className="h-12 bg-card"
          value={input}
          placeholder="اسأل عن أفضل قرار الآن..."
          disabled={isPending}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button className="h-12 w-12 shrink-0 p-0" aria-label="إرسال السؤال" disabled={isPending || !input.trim()} onClick={submit}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
