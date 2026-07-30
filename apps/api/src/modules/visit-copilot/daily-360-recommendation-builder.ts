import type { SgiSituation, VisitCopilot360StoppedProduct } from "@field-sales-os/schemas";

// Recommendation Builder for "ملخص اليوم 360°" (2026-07-29 follow-up) —
// deterministic, zero-GPT coaching text per lost-opportunity customer card.
// Replaces the previous approach of showing SgiSituation.detail/recommendation
// verbatim (one generic sentence shape for every situation) with output
// tailored to the specific problem type, built only from fields already
// present on the situation (metricValue/metricValuePrior/stoppedProducts) —
// no invented numbers, no new backend call.
//
// Scope: covers the two SgiSituation types actually feeding
// `lostOpportunities` today (see visit-copilot.service.ts daily360Summary) —
// PRODUCT_DECLINE (further split into "sales decline" vs. "a specific
// product stopped selling", using stoppedProducts as the real signal) and
// LOST_SALES. COLLECTION_RISK/RETURNS/coverage/growth rule-sets are not
// wired in here yet — priorityDebtors/interventionNeeded don't currently
// carry the same per-item structured facts (no per-debtor product/visit
// detail on the schema), so extending them is a separate, explicit follow-up
// rather than something this file can honestly do today without inventing
// data.

export type Daily360OpportunityType = "sales-decline" | "product-stopped";

export interface Daily360Coaching {
  opportunityType: Daily360OpportunityType;
  diagnosis: string;
  likelyReason: string | null;
  visitAction: string;
  visitGoal: string;
  topProducts: VisitCopilot360StoppedProduct[];
  extraProductCount: number;
}

const MAX_VISIBLE_PRODUCTS = 3;

function fmt(value: number): string {
  return Math.round(value).toLocaleString("ar-EG");
}

function pctDrop(before: number, after: number): number | null {
  if (before <= 0) return null;
  return Math.round(((before - after) / before) * 100);
}

// Every situation feeding lostOpportunities today is PRODUCT_DECLINE or
// LOST_SALES (see visit-copilot.service.ts's declineSituations filter).
// stoppedProducts is PRODUCT_DECLINE-only per its own schema comment — a
// situation with entries there names a real product-level cutback, which is
// a more specific, more actionable case ("توقف صنف") than a plain aggregate
// sales drop, so it's coached differently even though both share the same
// SgiSituationType.
function resolveOpportunityType(situation: Pick<SgiSituation, "stoppedProducts">): Daily360OpportunityType {
  return (situation.stoppedProducts?.length ?? 0) > 0 ? "product-stopped" : "sales-decline";
}

export function buildLostOpportunityCoaching(input: {
  customerName: string;
  valueBefore: number;
  valueAfter: number;
  stoppedProducts: VisitCopilot360StoppedProduct[];
}): Daily360Coaching {
  const opportunityType = resolveOpportunityType(input);
  const decline = Math.max(0, input.valueBefore - input.valueAfter);
  const drop = pctDrop(input.valueBefore, input.valueAfter);
  const sortedProducts = [...input.stoppedProducts].sort((a, b) => b.value - a.value);
  const topProducts = sortedProducts.slice(0, MAX_VISIBLE_PRODUCTS);
  const extraProductCount = Math.max(0, sortedProducts.length - topProducts.length);
  const topProduct = sortedProducts[0] ?? null;

  if (opportunityType === "product-stopped" && topProduct) {
    // Real evidence: this specific product's quantity/value is on record as
    // having dropped to zero (or near it) for this customer — the product
    // name and its prior pattern are facts from stoppedProducts, not a guess.
    const diagnosis = `${input.customerName} توقف عن شراء ${topProduct.productName} (كان يشتري ${fmt(topProduct.quantity)} ${topProduct.unit} بقيمة ${fmt(topProduct.value)})${extraProductCount > 0 ? ` وأصناف أخرى` : ""}.`;
    const likelyReason = "قد يكون السبب مشكلة توفر لدى العميل، تجربة منافس، أو تغيّر في احتياجه لهذا الصنف — يحتاج تأكيد ميداني.";
    const visitAction = `اسأل ${input.customerName} عن سبب توقف ${topProduct.productName} تحديدًا — تحقق من المخزون الحالي لديه أو وجود بديل من منافس.`;
    const visitGoal = `الاتفاق على إعادة طلب ${topProduct.productName} بكمية قريبة من متوسطه السابق (${fmt(topProduct.quantity)} ${topProduct.unit}).`;
    return { opportunityType, diagnosis, likelyReason, visitAction, visitGoal, topProducts, extraProductCount };
  }

  // sales-decline: an aggregate drop with no single named product on
  // record — only the overall before/after numbers are real evidence here.
  const diagnosis = drop !== null
    ? `${input.customerName}: مبيعاته تراجعت من ${fmt(input.valueBefore)} إلى ${fmt(input.valueAfter)} (تراجع ${drop}%، بقيمة ${fmt(decline)}).`
    : `${input.customerName}: مبيعاته الحالية ${fmt(input.valueAfter)} بدون بيانات كافية لفترة مرجعية سابقة لحساب نسبة التراجع.`;
  const likelyReason = topProduct
    ? `قد يكون السبب مرتبطًا بـ${topProduct.productName} تحديدًا، وهو الأكثر مساهمة في التراجع — يحتاج تأكيد من العميل.`
    : null;
  const visitAction = topProduct
    ? `اسأل ${input.customerName} عن سبب تراجع طلب ${topProduct.productName}، واقترح إعادة طلب بكمية محددة بدل الاكتفاء بالمتابعة العامة.`
    : `ناقش ${input.customerName} في سبب التراجع العام في الطلبية، واطلب تحديد كمية واضحة للطلبية القادمة.`;
  const visitGoal = topProduct
    ? `الاتفاق على طلبية تشمل ${topProduct.productName} بكمية لا تقل عن مستواه قبل التراجع.`
    : `الاتفاق على قيمة طلبية محددة تقارب ${fmt(input.valueBefore)} خلال الزيارة القادمة.`;
  return { opportunityType, diagnosis, likelyReason, visitAction, visitGoal, topProducts, extraProductCount };
}
