import { Bot, X, Sparkles } from "lucide-react";

interface AiPanelProps {
  onClose: () => void;
}

export function AiPanel({ onClose }: AiPanelProps) {
  return (
    <aside className="flex flex-col h-full w-[300px] border-l border-border bg-card shrink-0">
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground leading-none">AI Assistant</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Powered by AI</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Close AI Assistant"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Reserved placeholder */}
        <div className="h-full flex flex-col items-center justify-center text-center px-4 gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-7 w-7 text-primary/60" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">AI Assistant</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              This panel is reserved for an AI assistant. Connect your AI integration to enable contextual help.
            </p>
          </div>
          <div className="w-full rounded-lg border border-dashed border-border p-3">
            <p className="text-[11px] text-muted-foreground/60 font-mono">
              // AI integration goes here
            </p>
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 opacity-50 cursor-not-allowed">
          <input
            disabled
            placeholder="Ask AI anything…"
            className="flex-1 text-sm bg-transparent text-foreground placeholder:text-muted-foreground outline-none cursor-not-allowed"
          />
          <Bot className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          AI integration not yet configured
        </p>
      </div>
    </aside>
  );
}
