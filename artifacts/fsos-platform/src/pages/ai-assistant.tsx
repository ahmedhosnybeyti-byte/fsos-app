import { Bot, Sparkles, User, Send, RefreshCw, Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/page-header";

const EXAMPLE_MESSAGES = [
  {
    role: "assistant",
    content: "Hello James! I've reviewed your territory data for today. You have 6 visits planned in Dubai South with a total pipeline of AED 28,500. Union Coop – Al Quoz hasn't been visited in 7 days and may be at risk.",
    time: "09:04 AM",
  },
  {
    role: "user",
    content: "What's my top priority customer today?",
    time: "09:06 AM",
  },
  {
    role: "assistant",
    content: "Based on visit frequency, revenue potential, and last interaction — your top priority is **LuLu Hypermarket – Deira City Centre**. They account for AED 198,400 MTD and are due for a promotional planogram review. I recommend leading with the new Ariel 3-in-1 promotion.",
    time: "09:06 AM",
  },
  {
    role: "user",
    content: "Which SKUs should I push at Carrefour today?",
    time: "09:08 AM",
  },
  {
    role: "assistant",
    content: "For Carrefour – Mall of Emirates, I recommend focusing on:\n\n• **Ariel Liquid 2L** — currently 12% above territory average, high velocity\n• **Head & Shoulders 400ml** — low shelf share vs. competitor, opportunity to negotiate facings\n• **Nescafé Classic 200g** — buyer requested samples last visit\n\nAvoid pushing Lay's Max today — they're overstocked from last week's promotion.",
    time: "09:08 AM",
  },
];

const SUGGESTIONS = [
  "Summarize today's route",
  "Which customers are at risk?",
  "Top SKU opportunities this week",
  "Draft an order for LuLu Hypermarket",
];

export default function AiAssistant() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[700px]">
      <PageHeader title="AI Assistant" description="Your intelligent FMCG sales co-pilot">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-card text-sm text-muted-foreground hover:bg-accent transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> New Chat
        </button>
      </PageHeader>

      <div className="flex flex-col flex-1 rounded-xl border border-border bg-card overflow-hidden">
        {/* Context banner */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border-b border-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="text-xs text-primary font-medium">
            AI is aware of your territory, today's visits, and real-time inventory levels
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {EXAMPLE_MESSAGES.map((msg, i) => (
            <div key={i} className={["flex gap-3", msg.role === "user" ? "flex-row-reverse" : ""].join(" ")}>
              {/* Avatar */}
              <div className={[
                "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                msg.role === "assistant" ? "bg-primary/10" : "bg-muted",
              ].join(" ")}>
                {msg.role === "assistant"
                  ? <Bot className="h-4 w-4 text-primary" />
                  : <User className="h-4 w-4 text-muted-foreground" />
                }
              </div>
              {/* Bubble */}
              <div className={[
                "max-w-[75%] rounded-xl px-4 py-3",
                msg.role === "assistant"
                  ? "bg-muted/60 text-foreground"
                  : "bg-primary text-primary-foreground",
              ].join(" ")}>
                <p className="text-sm leading-relaxed whitespace-pre-line">{msg.content}</p>
                <p className={["text-[10px] mt-1.5", msg.role === "assistant" ? "text-muted-foreground" : "text-primary-foreground/60"].join(" ")}>
                  {msg.time}
                </p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted/60 rounded-xl px-4 py-3 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>

        {/* Suggestion chips */}
        <div className="px-4 py-2 border-t border-border flex gap-2 overflow-x-auto">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-background text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Lightbulb className="h-3 w-3" />
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring transition-shadow">
            <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              placeholder="Ask your AI assistant anything about your territory…"
              className="flex-1 text-sm bg-transparent text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button className="h-7 w-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors shrink-0">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
