import { Lightbulb, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VisitCopilotBriefing } from "@/lib/types";

export function QuickVisitBrief({ briefing }: { briefing: VisitCopilotBriefing }) {
  const trendUp = briefing.sales.trendPct >= 0;
  const collection = briefing.collections.pending > 0 ? `معلّق ${briefing.collections.pending.toLocaleString()}` : `تم ${briefing.collections.collected.toLocaleString()}`;

  return (
    <section className="space-y-3" aria-labelledby="quick-brief-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="quick-brief-title" className="text-sm font-semibold">ملخص الزيارة السريع</h2>
        <span className="text-xs text-muted-foreground">نظرة خلال 10 ثوانٍ</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BriefValue label="المبيعات" value={briefing.sales.total.toLocaleString()} />
        <BriefValue label="التحصيل" value={collection} compact />
        <BriefValue label="المرتجعات" value={briefing.returns.total.toLocaleString()} />
        <div className="rounded-xl border border-border/70 bg-card p-3">
          <p className="text-xs text-muted-foreground">اتجاه المبيعات</p>
          <p className={cn("mt-1 flex items-center gap-1 text-lg font-bold", trendUp ? "text-emerald-600" : "text-rose-600")}>
            {trendUp ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {Math.abs(briefing.sales.trendPct).toLocaleString()}%
          </p>
        </div>
      </div>
      {briefing.topProducts.length > 0 && (
        <div className="rounded-xl border border-border/70 bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">أفضل المنتجات</p>
          <div className="flex flex-wrap gap-1.5">
            {briefing.topProducts.slice(0, 3).map((product) => (
              <Badge key={product.productCode} variant="secondary" className="font-normal">
                {product.productName}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span>{briefing.topOpportunity}</span>
      </div>
    </section>
  );
}

function BriefValue({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-bold", compact ? "text-sm" : "text-lg")}>{value}</p>
    </div>
  );
}
