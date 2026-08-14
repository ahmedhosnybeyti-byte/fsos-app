export type Daily360Confidence = "عالٍ" | "متوسط" | "منخفض";

export interface Daily360Diagnosis {
  diagnosis: string;
  confidence: Daily360Confidence | null;
  visitAction: string;
  visitGoal: string;
}

const format = (value: number) => Math.round(value).toLocaleString("ar-EG");

/**
 * Rule-based customer × SKU visit diagnosis.
 *
 * It deliberately receives only measured facts.  It can describe a pattern,
 * but never turns an unmeasured cause (stockout, price, competitor, quality,
 * or customer refusal) into a fact.
 */
export function buildDaily360Diagnosis(input: {
  productName: string;
  sales90: number;
  sales30: number;
  suggestedQuantity: number;
  returnQuantity?: number | null;
  lastPurchaseDate?: string | null;
}): Daily360Diagnosis {
  const sales90 = Math.max(0, input.sales90);
  const sales30 = Math.max(0, input.sales30);
  const returns = Math.max(0, input.returnQuantity ?? 0);
  const lost = sales90 > 0 && sales30 === 0;
  const decline = sales90 > 0 && sales30 > 0 && sales30 * 3 < sales90;
  const positive = sales90 > 0 && sales30 > 0 && sales30 * 3 >= sales90;
  const lastPurchase = input.lastPurchaseDate ? ` آخر شراء مؤكد: ${input.lastPurchaseDate}.` : "";

  if (sales90 <= 0) {
    return {
      diagnosis: "لا توجد بيانات كافية لتحديد السبب بدقة.",
      confidence: null,
      visitAction: `تحقق من وجود بيانات شراء صالحة لـ${input.productName} قبل اقتراح الطلب.`,
      visitGoal: "تأكيد نقطة بداية قابلة للقياس لهذا الصنف.",
    };
  }

  if (lost && returns > 0) {
    return {
      diagnosis: `توقف شراء بعد صافي مبيعات ${format(sales90)} خلال 90 يومًا وصفر خلال آخر 30 يومًا، مع مرتجعات مثبتة قدرها ${format(returns)}.${lastPurchase} لا توجد بيانات كافية لتحديد السبب بدقة.`,
      confidence: "متوسط",
      visitAction: `راجع الكمية السابقة مقابل المرتجع قبل إعادة تحميل ${input.productName}.`,
      visitGoal: `تحديد كمية إعادة آمنة لـ${input.productName} دون تجاوز الطلب المثبت.`,
    };
  }

  if (lost) {
    return {
      diagnosis: `Lost Sales: كان لصنف ${input.productName} صافي مبيعات ${format(sales90)} خلال 90 يومًا، ثم توقف تمامًا خلال آخر 30 يومًا.${lastPurchase} لا توجد بيانات كافية لتحديد السبب بدقة.`,
      confidence: "متوسط",
      visitAction: `استفسر عن سبب توقف ${input.productName} وحاول استرجاعه؛ تحقق من وجود الصنف لدى العميل قبل اقتراح الطلب.`,
      visitGoal: `إعادة ${input.productName} بكمية تدريجية لا تتجاوز ${format(input.suggestedQuantity)}.`,
    };
  }

  if (decline) {
    const drop = Math.round((1 - sales30 / sales90) * 100);
    return {
      diagnosis: `تراجع في معدل أو عمق الطلب: صافي مبيعات ${input.productName} انخفض من ${format(sales90)} خلال 90 يومًا إلى ${format(sales30)} خلال آخر 30 يومًا (${drop}%). لا توجد بيانات كافية لتحديد السبب بدقة.`,
      confidence: "متوسط",
      visitAction: `أكد استمرار ${input.productName} ووسّع الكمية تدريجيًا وفق الطلب الفعلي.`,
      visitGoal: `رفع الطلب التالي لـ${input.productName} تدريجيًا مع قياس الاستجابة.`,
    };
  }

  if (positive) {
    return {
      diagnosis: `أداء إيجابي مستمر: صافي مبيعات ${input.productName} خلال آخر 30 يومًا (${format(sales30)}) يواكب أو يتجاوز معدل 90 يومًا (${format(sales90)}).`,
      confidence: "عالٍ",
      visitAction: `حافظ على توفر ${input.productName} وأكد استمرار الصنف قبل توسيع الكمية تدريجيًا.`,
      visitGoal: `الحفاظ على معدل الطلب الحالي لـ${input.productName} مع توسع محسوب.`,
    };
  }

  return {
    diagnosis: "لا توجد بيانات كافية لتحديد السبب بدقة.",
    confidence: null,
    visitAction: `تحقق من بيانات ${input.productName} قبل اتخاذ قرار تحميل.`,
    visitGoal: "تأكيد البيانات المطلوبة للقرار.",
  };
}
