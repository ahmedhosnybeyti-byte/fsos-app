import { ArrowLeft, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SmartLoadingSession } from "@/lib/types";

type DecisionKind = "stale" | "alignment" | "priority" | "opportunities" | "loading";

type ExecutiveDecision = {
  kind: DecisionKind;
  happened: string;
  whyItMatters: string;
  action: string;
};

function scopeLabel(roleCode: string | undefined, locale: "ar" | "en"): string {
  if (locale === "ar") {
    if (roleCode === "SUPERVISOR") return "فريق مندوبيك";
    if (roleCode === "MANAGER") return "المشرفين والمسارات ضمن نطاقك";
    return "الإدارة والمناطق ضمن نطاقك";
  }
  if (roleCode === "SUPERVISOR") return "your sales-rep team";
  if (roleCode === "MANAGER") return "the supervisors and routes in your scope";
  return "the management scope and regions";
}

/**
 * This is intentionally an orchestration layer, not a scoring model. It
 * preserves the existing engines' own signals and presents their established
 * intervention order: protect stock, protect sales, then recover demand.
 */
export function getExecutiveDecisions({ session, roleCode, locale }: { session: Extract<SmartLoadingSession, { state: "ready" }>; roleCode: string | undefined; locale: "ar" | "en" }): ExecutiveDecision[] {
  const scope = scopeLabel(roleCode, locale);
  const ar = locale === "ar";
  const decisions: ExecutiveDecision[] = [];

  if (session.staleCount > 0) decisions.push({
    kind: "stale",
    happened: ar ? `يوجد خطر ركود في ${scope}.` : `There is a slow-moving stock risk in ${scope}.`,
    whyItMatters: ar ? "أي تحميل إضافي قد يزيد المخزون غير المتحرك." : "Additional loading can increase non-moving inventory.",
    action: ar ? "راجع الأصناف الراكدة" : "Review slow movers",
  });

  // Uses the same <75% threshold already used by the management alignment
  // presentation; it does not introduce a new classification or calculation.
  if (session.managementStockAlignmentPercent !== null && session.managementStockAlignmentPercent < 75) decisions.push({
    kind: "alignment",
    happened: ar ? `توافق المخزون يحتاج مراجعة في ${scope}.` : `Stock alignment needs review in ${scope}.`,
    whyItMatters: ar ? "قد لا يغطي المخزون المبيعات المتوقعة للأصناف المطلوبة." : "Available stock may not cover expected demand for required products.",
    action: ar ? "راجع توصيات التحميل" : "Review loading recommendations",
  });

  if (session.priorityProducts.length > 0) decisions.push({
    kind: "priority",
    happened: ar ? `توجد أصناف ذات أولوية في ${scope}.` : `There are priority products in ${scope}.`,
    whyItMatters: ar ? "هذه الأصناف مرتبطة بطلب مؤكد أو طلب يحتاج حماية." : "These products are tied to confirmed or protected demand.",
    action: ar ? "راجع الأصناف ذات الأولوية" : "Review priority products",
  });

  if (session.lostOpportunities.length > 0) decisions.push({
    kind: "opportunities",
    happened: ar ? `توجد فرص طلب غير مخدومة في ${scope}.` : `There are unserved demand opportunities in ${scope}.`,
    whyItMatters: ar ? "قد تضيع مبيعات يمكن إدراجها في خطة التحميل القادمة." : "Sales that could be included in the next loading plan may be missed.",
    action: ar ? "راجع الفرص الضائعة" : "Review lost opportunities",
  });

  if (decisions.length === 0) decisions.push({
    kind: "loading",
    happened: ar ? "لا توجد إشارة تدخل أعلى أولوية في النطاق الحالي." : "There is no higher-priority intervention signal in the current scope.",
    whyItMatters: ar ? "تبقى مراجعة خطة التحميل النهائية ضرورية قبل التنفيذ." : "The final loading plan still needs review before execution.",
    action: ar ? "راجع خطة التحميل" : "Review loading plan",
  });

  return decisions.slice(0, 3);
}

export function ExecutiveDecisionCenter({ session, roleCode, locale, onDecision }: { session: Extract<SmartLoadingSession, { state: "ready" }>; roleCode: string | undefined; locale: "ar" | "en"; onDecision: (kind: DecisionKind) => void }) {
  const decisions = getExecutiveDecisions({ session, roleCode, locale });
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
