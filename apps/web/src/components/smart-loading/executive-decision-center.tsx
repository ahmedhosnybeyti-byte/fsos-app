import { ArrowLeft, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SmartLoadingSession } from "@/lib/types";

type DecisionKind = "stale" | "alignment" | "priority" | "opportunities" | "loading";
export type ExecutiveDecisionScope = {
  managerName?: string;
  supervisorName?: string;
  salesRepName?: string;
};

type ExecutiveDecision = {
  kind: DecisionKind;
  happened: string;
  whyItMatters: string;
  action: string;
};

function scopeLabel(session: Extract<SmartLoadingSession, { state: "ready" }>, scope: ExecutiveDecisionScope, locale: "ar" | "en"): string {
  const staleRoutes = new Set(session.managementStaleRouteProducts?.map((item) => item.routeId).filter(Boolean) ?? []);
  const routes = staleRoutes.size || new Set(session.routeCustomers.map((customer) => customer.routeId).filter((routeId): routeId is string => Boolean(routeId))).size;
  if (locale === "ar") {
    if (scope.salesRepName) return `المندوب ${scope.salesRepName}`;
    if (scope.supervisorName) return `المشرف ${scope.supervisorName}`;
    if (scope.managerName) return `المدير ${scope.managerName}`;
    return routes > 0 ? `${routes} مسار${routes === 1 ? "" : "ات"} متأثر` : "المسارات المتأثرة";
  }
  if (scope.salesRepName) return `sales rep ${scope.salesRepName}`;
  if (scope.supervisorName) return `supervisor ${scope.supervisorName}`;
  if (scope.managerName) return `manager ${scope.managerName}`;
  return routes === 1 ? "the affected route" : `${routes || "the affected"} routes`;
}

/**
 * This is intentionally an orchestration layer, not a scoring model. It
 * preserves the existing engines' own signals and presents their established
 * intervention order: protect stock, protect sales, then recover demand.
 */
export function getExecutiveDecisions({ session, scope: scopeSelection, locale }: { session: Extract<SmartLoadingSession, { state: "ready" }>; scope: ExecutiveDecisionScope; locale: "ar" | "en" }): ExecutiveDecision[] {
  const scope = scopeLabel(session, scopeSelection, locale);
  const ar = locale === "ar";
  const decisions: ExecutiveDecision[] = [];

  if (session.staleCount > 0) decisions.push({
    kind: "stale",
    happened: ar ? `يوجد خطر ركود لدى ${scope}.` : `There is a slow-moving stock risk for ${scope}.`,
    whyItMatters: ar ? "قد يرتفع المخزون غير المتحرك وتتراجع كفاءة المسارات." : "Non-moving inventory can increase and reduce route efficiency.",
    action: ar ? "تابع المسارات المتأثرة" : "Follow affected routes",
  });

  // Uses the same <75% threshold already used by the management alignment
  // presentation; it does not introduce a new classification or calculation.
  if (session.managementStockAlignmentPercent !== null && session.managementStockAlignmentPercent < 75) decisions.push({
    kind: "alignment",
    happened: ar ? `توجد فجوة في جودة التحميل لدى ${scope}.` : `There is a loading-quality gap for ${scope}.`,
    whyItMatters: ar ? "قد لا يغطي المخزون المبيعات المتوقعة في المسارات." : "Stock may not cover expected sales across the routes.",
    action: ar ? "تحقق من سبب الفجوة" : "Check the gap cause",
  });

  if (session.priorityProducts.length > 0) decisions.push({
    kind: "priority",
    happened: ar ? `توجد أصناف حساسة للمبيعات لدى ${scope}.` : `There are sales-sensitive products for ${scope}.`,
    whyItMatters: ar ? "أي قصور في تغطيتها قد يرفع خطر فقد المبيعات." : "Insufficient coverage can increase the risk of lost sales.",
    action: ar ? "راقب خطر فقد المبيعات" : "Monitor lost-sales risk",
  });

  if (session.lostOpportunities.length > 0) decisions.push({
    kind: "opportunities",
    happened: ar ? `توجد فرص طلب غير مخدومة لدى ${scope}.` : `There are unserved demand opportunities for ${scope}.`,
    whyItMatters: ar ? "قد تضيع مبيعات ممكنة في المسارات المتأثرة." : "Potential sales may be missed on the affected routes.",
    action: ar ? "تابع فرص الطلب غير المخدومة" : "Follow unserved demand",
  });

  if (decisions.length === 0) decisions.push({
    kind: "loading",
    happened: ar ? `لا توجد إشارة تدخل أعلى أولوية لدى ${scope}.` : `There is no higher-priority intervention signal for ${scope}.`,
    whyItMatters: ar ? "تبقى جودة التحميل بحاجة إلى مراجعة إدارية." : "Loading quality still requires management review.",
    action: ar ? "راجع جودة التحميل" : "Review loading quality",
  });

  return decisions.slice(0, 3);
}

export function ExecutiveDecisionCenter({ session, scope, locale, onDecision }: { session: Extract<SmartLoadingSession, { state: "ready" }>; scope: ExecutiveDecisionScope; locale: "ar" | "en"; onDecision: (kind: DecisionKind) => void }) {
  const decisions = getExecutiveDecisions({ session, scope, locale });
  const ar = locale === "ar";
  const Arrow = ar ? ChevronLeft : ArrowLeft;
  return (
    <section aria-labelledby="executive-decision-center-title" className="glass-hero rise-in p-5 max-md:p-3">
      <div aria-hidden className="hero-aurora pointer-events-none absolute inset-0" />
      <div className="relative">
        <div className="mb-4 max-md:mb-3">
          <h2 id="executive-decision-center-title" className="text-lg font-semibold tracking-tight max-md:text-base">{ar ? "مركز القرار التنفيذي" : "Executive Decision Center"}</h2>
          <p className="mt-1 text-sm text-muted-foreground max-md:text-xs">{ar ? "ما أول ثلاثة قرارات يجب أن تتخذها اليوم؟" : "What are the first three decisions to make today?"}</p>
        </div>
        <div className="grid gap-3 max-md:gap-2.5 lg:grid-cols-3">
          {decisions.map((decision, index) => (
            <Card key={decision.kind} className="glass-card card-lift min-w-0 overflow-hidden">
              <CardHeader className="relative space-y-1 p-4 pb-2 max-md:p-3 max-md:pb-2">
                <CardDescription className="text-xs font-medium text-ai">{ar ? `قرار ${index + 1}` : `Decision ${index + 1}`}</CardDescription>
                <CardTitle className="text-base leading-6 tracking-tight max-md:text-sm max-md:leading-5">{decision.happened}</CardTitle>
              </CardHeader>
              <CardContent className="relative space-y-3 p-4 pt-0 max-md:space-y-2.5 max-md:p-3 max-md:pt-0">
                <p className="text-sm leading-relaxed text-muted-foreground max-md:text-xs">{decision.whyItMatters}</p>
                <Button variant="outline" className="h-10 w-full justify-between bg-card/80 backdrop-blur-sm transition-colors hover:bg-ai/10" onClick={() => onDecision(decision.kind)}>
                  {decision.action}<Arrow className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
