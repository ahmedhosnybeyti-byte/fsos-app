import { ChevronLeft, CircleDot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VisitCopilotCustomer } from "@/lib/types";
import { getDemoVisitMeta } from "./demo-intelligence";

export function VisitPlanCard({ customer, index, onOpen }: { customer: VisitCopilotCustomer; index: number; onOpen: (customerCode: string) => void }) {
  const demo = getDemoVisitMeta(customer, index);

  return (
    <Button
      variant="ghost"
      className="h-auto w-full justify-start rounded-2xl border border-border/70 bg-card p-4 text-start shadow-sm hover:bg-secondary/60"
      onClick={() => onOpen(customer.customerCode)}
    >
      <span className="min-w-0 flex-1 space-y-2">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {customer.visitSequence}
          </span>
          <span className="truncate text-base font-semibold">{customer.customerName}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs">
          <Badge className="bg-primary/10 text-primary hover:bg-primary/10">{demo.mission}</Badge>
          <span className="text-muted-foreground">الأولوية: {Math.round(customer.priorityScore)}</span>
          <span className={cn("flex items-center gap-1", demo.status === "قيد الزيارة" ? "text-emerald-600" : "text-muted-foreground")}>
            <CircleDot className="h-3.5 w-3.5" />
            {demo.status}
          </span>
        </span>
        <span className="block text-[11px] text-amber-600 dark:text-amber-300">مهمة وحالة مؤقتتان للعرض</span>
      </span>
      <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
    </Button>
  );
}
